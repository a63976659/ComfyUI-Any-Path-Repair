import os
import threading
import time
import sys
import server
import folder_paths
from aiohttp import web
from urllib.parse import unquote
from .core_utils import normalize_path, parse_hf_url

active_downloads = set()
cancel_flags = {}
download_lock = threading.Lock()

def download_with_progress(url, save_path, filename_for_msg, cancel_event):
    import urllib.request
    
    # 控制台简洁提示
    print(f"\n⬇️ [Path Fixer] 启动下载: {filename_for_msg}")
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        req = urllib.request.Request(url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=30) as response:
            total_size = int(response.info().get('Content-Length', 0))
            content_type = response.info().get('Content-Type', '')
            
            if 'text/html' in content_type and total_size < 100 * 1024:
                raise Exception("链接返回了HTML页面，可能是无效链接。")

            with open(save_path, 'wb') as out_file:
                downloaded_size = 0
                block_size = 32768
                last_report_time = 0
                start_time = time.time()
                
                while True:
                    if cancel_event.is_set():
                        print(f"\n🚫 [Path Fixer] 用户中断: {filename_for_msg}")
                        return False, "用户中断"

                    try:
                        buffer = response.read(block_size)
                    except Exception as e:
                        raise Exception(f"网络中断: {str(e)}")

                    if not buffer: break
                    
                    out_file.write(buffer)
                    downloaded_size += len(buffer)
                    
                    current_time = time.time()
                    if current_time - last_report_time > 0.5:
                        progress = (downloaded_size / total_size) * 100 if total_size > 0 else 0
                        speed = downloaded_size / (current_time - start_time + 0.001) / 1024 / 1024 
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
        "filename": filename, "current": current, "total": total
    })

def run_download_task(url, repo_id, filename, save_dir, source="HF Mirror"):
    safe_filename = os.path.basename(filename) 
    full_path = os.path.join(save_dir, safe_filename)
    
    # 强制转换直链和镜像
    final_url = url.replace("huggingface.co", "hf-mirror.com") if source == "HF Mirror" else url
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
                # ModelScope logic placeholder
                pass 
            except ImportError: raise ImportError("未安装 modelscope")
        else:
            if not os.path.exists(save_dir): os.makedirs(save_dir)
            success, error_msg = download_with_progress(final_url, full_path, safe_filename, cancel_event)
            
            if not success and error_msg == "用户中断":
                if os.path.exists(full_path):
                    try: os.remove(full_path)
                    except: pass
                raise Exception("下载已中断")
            
            if not success: raise Exception(error_msg)
            
            # 空文件检查
            if os.path.exists(full_path) and os.path.getsize(full_path) < 1024:
                try: os.remove(full_path)
                except: pass
                raise Exception("文件过小，可能是无效链接")

        success = True
    except Exception as e:
        error_msg = str(e)
        success = False
        if os.path.exists(full_path):
            try: os.remove(full_path)
            except: pass
    finally:
        with download_lock:
            active_downloads.discard(safe_filename)
            if safe_filename in cancel_flags: del cancel_flags[safe_filename]
    
    server.PromptServer.instance.send_sync("model_fixer_download_status", {
        "filename": safe_filename, "success": success, "error": error_msg, "path": full_path if success else None
    })

async def handle_download_request(request):
    try:
        json_data = await request.json()
        url = json_data.get("url")
        model_type = json_data.get("model_type") 
        source = json_data.get("source", "HF Mirror")

        if not url: return web.json_response({"success": False, "message": "参数缺失"})

        # 1. URL 嗅探与强制类型纠正
        url_decoded = unquote(url).lower()
        if "diffusion_models" in url_decoded: model_type = "diffusion_models"
        elif "text_encoders" in url_decoded: model_type = "text_encoders"
        elif "/vae/" in url_decoded or "/vae." in url_decoded: model_type = "vae"
        elif "lora" in url_decoded: model_type = "loras"
        
        if not model_type: return web.json_response({"success": False, "message": "无法识别模型类型"})

        # 2. 物理路径锁定 (加入 LLM 和 TTS)
        target_dir = None
        STRICT_FOLDERS = [
            "diffusion_models", "text_encoders", "vae", "loras", "clip", 
            "unet", "latent_upscale_models", "ultralytics", "gligen",
            "hypernetworks", "photomaker", "sams", "grounding-dino", 
            "animatediff_models", "upscale_models", "LLM", "TTS"
        ]
        
        if model_type in STRICT_FOLDERS:
            direct_path = os.path.join(folder_paths.models_dir, model_type)
            if not os.path.exists(direct_path):
                try: os.makedirs(direct_path)
                except: pass
            if os.path.exists(direct_path): target_dir = direct_path
        
        # 3. 兜底查询
        if not target_dir:
            target_dirs = folder_paths.get_folder_paths(model_type)
            if target_dirs: target_dir = target_dirs[0]
            else: target_dir = os.path.join(folder_paths.models_dir, model_type)

        if not os.path.exists(target_dir): os.makedirs(target_dir)

        repo_id, raw_filename = parse_hf_url(url)
        if not raw_filename: raw_filename = os.path.basename(normalize_path(url))
        safe_filename = os.path.basename(raw_filename)

        with download_lock:
            if safe_filename in active_downloads:
                return web.json_response({"success": False, "status": "downloading", "message": "任务进行中"})
            
            save_path = os.path.join(target_dir, safe_filename)
            if os.path.exists(save_path):
                return web.json_response({"success": True, "status": "exists", "message": "文件已存在"})
            
            active_downloads.add(safe_filename)

        thread = threading.Thread(target=run_download_task, args=(url, repo_id, raw_filename, target_dir, source))
        thread.daemon = True
        thread.start()
        
        return web.json_response({"success": True, "status": "started", "message": "已启动"})
    except Exception as e:
        if 'safe_filename' in locals():
            with download_lock: active_downloads.discard(safe_filename)
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
                return web.json_response({"success": False, "message": "任务不存在"})
    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

async def handle_get_active_tasks(request):
    return web.json_response({"active": list(active_downloads)})