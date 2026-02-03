import os
import folder_paths
from aiohttp import web
from .core_utils import normalize_path, load_local_links # <--- 已更新引用
from .config import get_type_mapping

def build_file_index(model_types):
    index = {}
    for m_type in model_types:
        try:
            files = folder_paths.get_filename_list(m_type)
            for f in files:
                base_name = os.path.basename(normalize_path(f)).lower()
                if base_name not in index: index[base_name] = []
                index[base_name].append({"full_path": f, "model_type": m_type})
        except: continue
    return index

async def handle_fix_request(request):
    try:
        json_data = await request.json()
        query_list = json_data.get("queries", [])
        dynamic_links = json_data.get("dynamic_links", {})
        local_links_db = load_local_links()
        
        results = []
        type_mapping = get_type_mapping()
        
        # 预构建索引
        relevant_types = set()
        for item in query_list:
            w_type = item.get("type")
            std_type = type_mapping.get(w_type)
            if std_type: relevant_types.add(std_type)
            else:
                relevant_types.update(["checkpoints", "loras", "clip", "unet", "vae"])
        
        file_index = build_file_index(list(relevant_types))
        
        for item in query_list:
            current_val = item.get("current_val")
            if not current_val: continue
            
            widget_type = item.get("type")
            standard_type = type_mapping.get(widget_type)
            
            if not standard_type:
                w_lower = widget_type.lower()
                if "clip" in w_lower or "text_encoder" in w_lower: standard_type = "clip"
                elif "unet" in w_lower or "diffusion" in w_lower: standard_type = "unet"
                elif "lora" in w_lower: standard_type = "loras"
                elif "checkpoint" in w_lower: standard_type = "checkpoints"
            
            target_basename = os.path.basename(normalize_path(current_val)).lower()
            
            # 1. 查找本地文件
            candidates = []
            if target_basename in file_index:
                same_type = [x["full_path"] for x in file_index[target_basename] if x["model_type"] == standard_type]
                other_type = [x["full_path"] for x in file_index[target_basename] if x["model_type"] != standard_type]
                candidates = same_type if same_type else other_type

            # 2. 检查是否已存在
            norm_current = normalize_path(current_val).lower()
            norm_candidates = [normalize_path(c).lower() for c in candidates]
            if norm_current in norm_candidates: continue 

            # 3. 查找下载链接
            download_link = None
            final_download_type = standard_type if standard_type else "uncategorized"
            
            if not candidates:
                if standard_type in dynamic_links and target_basename in dynamic_links[standard_type]:
                    download_link = dynamic_links[standard_type][target_basename]
                
                if not download_link:
                    for cat, files in dynamic_links.items():
                        for note_file, note_url in files.items():
                            if note_file.lower() == target_basename:
                                download_link = note_url
                                if cat != "uncategorized": final_download_type = cat
                                break
                        if download_link: break
                
                if not download_link and standard_type in local_links_db:
                    for db_file, db_url in local_links_db[standard_type].items():
                        if db_file.lower() == target_basename:
                            download_link = db_url
                            break

            if candidates or download_link:
                results.append({
                    "id": item.get("id"), "widget_name": widget_type, "old_value": current_val,
                    "candidates": candidates, "download_url": download_link, "model_type": final_download_type
                })
                
        return web.json_response({"fixed": results})
    except Exception as e:
        return web.json_response({"fixed": [], "error": str(e)})