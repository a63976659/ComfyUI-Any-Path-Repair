import os
import threading
import time
import sys
import server
import folder_paths
from aiohttp import web
from .core_utils import normalize_path, parse_hf_url

# 状态管理
active_downloads = set()
cancel_flags = {}
download_lock = threading.Lock()

def get_downloader_module():
    try:
        import huggingface_hub
        return huggingface_hub, True
    except ImportError:
        return None, False

def download_with_progress(url, save_path, filename_for_msg, cancel_event):
    """
    流式下载 + 控制台进度条 + 支持中断
    """
    import urllib.request

    print(f"\n⬇️ [Path Fixer] 开始下载: {filename_for_msg}")
    print(f"   直链地址: {url}")
    
    try:
        # 增加 User-Agent，防止被服务器拒绝
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        req = urllib.request.Request(url, headers=headers)
        
        # 设置超时时间，防止无限卡死
        with urllib.request.urlopen(req, timeout=30) as response:
            total_size = int(response.info().get('Content-Length', 0))
            
            # [检查] 如果返回的是 HTML (比如 404 页面或登录页)，Content-Type 会包含 text/html
            content_type = response.info().get('Content-Type', '')
            if 'text/html' in content_type and total_size < 100 * 1024: # 小于100KB的HTML通常是报错页
                 # 读取一点看看是不是错误信息
                preview = response.read(1000).decode('utf-8', errors='ignore')
                raise Exception(f"下载链接无效 (返回了HTML页面): {preview[:100]}...")

            with open(save_path, 'wb') as out_file:
                downloaded_size = 0
                block_size = 8192 * 4 
                last_report_time = 0
                start_time = time.time()
                
                while True:
                    if cancel_event.is_set():
                        print(f"\n🚫 [Path Fixer] 用户中断下载: {filename_for_msg}")
                        return False, "用户中断"

                    try:
                        buffer = response.read(block_size)
                    except Exception as e:
                        raise Exception(f"网络读取中断: {str(e)}")

                    if not buffer:
                        break
                    
                    out_file.write(buffer)
                    downloaded_size += len(buffer)
                    
                    # 控制台进度条
                    current_time = time.time()
                    if current_time - last_report_time > 0.5:
                        progress = (downloaded_size / total_size) * 100 if total_size > 0 else 0
                        speed = downloaded_size / (current_time - start_time + 0.001) / 1024 / 1024 # MB/s
                        sys.stdout.write(f"\r⏳ 下载中 [{filename_for_msg}]: {progress:.1f}% | {speed:.2f} MB/s")
                        sys.stdout.flush()
                        report_progress(filename_for_msg, downloaded_size, total_size)
                        last_report_time = current_time
            
            sys.stdout.write(f"\r✅ 下载完成 [{filename_for_msg}]: 100%                 \n")
            sys.stdout.flush()
            report_progress(filename_for_msg, downloaded_size, total_size)
            
        return True, ""
    except Exception as e:
        sys.stdout.write("\n")
        return False, str(e)

def report_progress(filename, current, total):
    server.PromptServer.instance.send_sync("model_fixer_download_progress", {
        "filename": filename,
        "current": current,
        "total": total
    })

def run_download_task(url, repo_id, filename, save_dir, source="HF Mirror"):
    safe_filename = os.path.basename(filename) 
    full_path = os.path.join(save_dir, safe_filename)
    
    # [核心修复 1] 处理 URL：强制替换镜像域名 & 修正 /blob/ 为 /resolve/
    final_url = url
    if source == "HF Mirror":
        # 简单替换域名，因为 urllib 不认识环境变量 HF_ENDPOINT
        final_url = final_url.replace("huggingface.co", "hf-mirror.com")
    
    # [核心修复 2] 确保是直链 (resolve) 而不是网页预览链接 (blob)
    final_url = final_url.replace("/blob/", "/resolve/")

    cancel_event = threading.Event()
    with download_lock:
        cancel_flags[safe_filename] = cancel_event

    success = False
    error_msg = ""
    
    try:
        if source == "ModelScope":
            try:
                from modelscope.hub.file_download import model_file_download
                pass 
            except ImportError:
                raise ImportError("未安装 modelscope")
        else:
            if not os.path.exists(save_dir): os.makedirs(save_dir)
            success, error_msg = download_with_progress(final_url, full_path, safe_filename, cancel_event)
            
            if not success and error_msg == "用户中断":
                if os.path.exists(full_path):
                    try: os.remove(full_path)
                    except: pass
                raise Exception("下载已中断")
            
            if not success: raise Exception(error_msg)
            
            # [核心修复 3] 下载完成后检查文件大小
            if os.path.exists(full_path) and os.path.getsize(full_path) < 1024:
                # 如果文件小于 1KB，极有可能是错误的空文件
                try: os.remove(full_path)
                except: pass
                raise Exception("下载失败：文件为空或过小 (可能是链接错误)")

        success = True

    except Exception as e:
        error_msg = str(e)
        success = False
        # 失败时清理残留文件
        if os.path.exists(full_path):
            try: os.remove(full_path)
            except: pass
            
    finally:
        with download_lock:
            active_downloads.discard(safe_filename)
            if safe_filename in cancel_flags:
                del cancel_flags[safe_filename]
    
    server.PromptServer.instance.send_sync("model_fixer_download_status", {
        "filename": safe_filename,
        "success": success,
        "error": error_msg,
        "path": full_path if success else None
    })

async def handle_download_request(request):
    try:
        json_data = await request.json()
        url = json_data.get("url")
        model_type = json_data.get("model_type")
        source = json_data.get("source", "HF Mirror")

        if not url or not model_type:
            return web.json_response({"success": False, "message": "参数缺失"})

        target_dirs = folder_paths.get_folder_paths(model_type)
        target_dir = target_dirs[0] if target_dirs else os.path.join(folder_paths.models_dir, model_type)
        if not os.path.exists(target_dir): os.makedirs(target_dir)

        repo_id, raw_filename = parse_hf_url(url)
        if not raw_filename: raw_filename = os.path.basename(normalize_path(url))
        safe_filename = os.path.basename(raw_filename)

        with download_lock:
            if safe_filename in active_downloads:
                return web.json_response({"success": False, "status": "downloading", "message": "该文件正在下载中"})
            
            save_path = os.path.join(target_dir, safe_filename)
            if os.path.exists(save_path):
                return web.json_response({"success": True, "status": "exists", "message": "文件已存在"})
            
            active_downloads.add(safe_filename)

        thread = threading.Thread(target=run_download_task, args=(url, repo_id, raw_filename, target_dir, source))
        thread.daemon = True
        thread.start()
        
        return web.json_response({"success": True, "status": "started", "message": "后台下载已启动"})
    except Exception as e:
        if 'safe_filename' in locals():
            with download_lock:
                active_downloads.discard(safe_filename)
        return web.json_response({"success": False, "message": str(e)})

async def handle_cancel_request(request):
    try:
        json_data = await request.json()
        filename = json_data.get("filename")
        with download_lock:
            if filename in cancel_flags:
                cancel_flags[filename].set() 
                return web.json_response({"success": True, "message": "中断信号已发送"})
            else:
                return web.json_response({"success": False, "message": "任务不存在或已结束"})
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

async def handle_get_active_tasks(request):
    return web.json_response({"active": list(active_downloads)})