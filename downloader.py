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
# 用于控制中断: { filename: threading.Event() }
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
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            total_size = int(response.info().get('Content-Length', 0))
            
            with open(save_path, 'wb') as out_file:
                downloaded_size = 0
                block_size = 8192 * 4 
                last_report_time = 0
                start_time = time.time()
                
                while True:
                    # [关键] 检查是否被用户中断
                    if cancel_event.is_set():
                        print(f"\n🚫 [Path Fixer] 用户中断下载: {filename_for_msg}")
                        return False, "用户中断"

                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    
                    out_file.write(buffer)
                    downloaded_size += len(buffer)
                    
                    # 1. 控制台进度条 (每0.5秒刷新一次，避免日志过多)
                    current_time = time.time()
                    if current_time - last_report_time > 0.5:
                        progress = (downloaded_size / total_size) * 100 if total_size > 0 else 0
                        speed = downloaded_size / (current_time - start_time + 0.001) / 1024 / 1024 # MB/s
                        # 使用 sys.stdout 实现单行刷新
                        sys.stdout.write(f"\r⏳ 下载中 [{filename_for_msg}]: {progress:.1f}% | {speed:.2f} MB/s")
                        sys.stdout.flush()
                        
                        # 2. 依然发送 WebSocket (为了前端知道什么时候变回 '完成' 状态，但不发频繁进度了)
                        # 用户要求控制台显示进度，UI上我们只在开始和结束通知即可，
                        # 或者为了防止 UI 假死，还是保留低频的心跳包
                        report_progress(filename_for_msg, downloaded_size, total_size)
                        last_report_time = current_time
            
            # 下载完成，换行
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
    
    # 创建该任务的中断标记
    cancel_event = threading.Event()
    with download_lock:
        cancel_flags[safe_filename] = cancel_event

    success = False
    error_msg = ""
    
    try:
        if source == "ModelScope":
            # ModelScope 暂不支持中断逻辑
            try:
                from modelscope.hub.file_download import model_file_download
                pass 
            except ImportError:
                raise ImportError("未安装 modelscope")
        else:
            if not os.path.exists(save_dir): os.makedirs(save_dir)
            success, error_msg = download_with_progress(url, full_path, safe_filename, cancel_event)
            
            if not success and error_msg == "用户中断":
                # 如果是中断，删除未下载完的文件
                if os.path.exists(full_path):
                    try: os.remove(full_path)
                    except: pass
                raise Exception("下载已中断")
            
            if not success: raise Exception(error_msg)

        success = True

    except Exception as e:
        error_msg = str(e)
        success = False
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

# [新增] 处理中断请求
async def handle_cancel_request(request):
    try:
        json_data = await request.json()
        filename = json_data.get("filename")
        with download_lock:
            if filename in cancel_flags:
                cancel_flags[filename].set() # 触发中断信号
                return web.json_response({"success": True, "message": "中断信号已发送"})
            else:
                return web.json_response({"success": False, "message": "任务不存在或已结束"})
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

async def handle_get_active_tasks(request):
    return web.json_response({"active": list(active_downloads)})