import os
import folder_paths
from aiohttp import web
from urllib.parse import unquote
from .core_utils import normalize_path, load_local_links
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
        
        relevant_types = set()
        for item in query_list:
            w_type = item.get("type")
            std_type = type_mapping.get(w_type)
            if std_type: relevant_types.add(std_type)
            else:
                relevant_types.update(["checkpoints", "loras", "clip", "unet", "vae", "diffusion_models", "text_encoders"])
        
        file_index = build_file_index(list(relevant_types))
        
        for item in query_list:
            current_val = item.get("current_val")
            if not current_val: continue
            
            widget_type = item.get("type")
            standard_type = type_mapping.get(widget_type)
            
            # 路径前缀分析
            norm_val = normalize_path(current_val)
            if "/" in norm_val:
                potential_folder = norm_val.split("/")[0].lower()
                for known_type in folder_paths.folder_names_and_paths:
                    if known_type.lower() == potential_folder:
                        standard_type = known_type
                        break

            if not standard_type:
                w_lower = widget_type.lower()
                if "clip" in w_lower or "text_encoder" in w_lower: standard_type = "clip"
                elif "unet" in w_lower or "diffusion" in w_lower: standard_type = "unet"
                elif "lora" in w_lower: standard_type = "loras"
                elif "checkpoint" in w_lower: standard_type = "checkpoints"
            
            target_basename = os.path.basename(norm_val).lower()
            
            # 本地搜索
            candidates = []
            if target_basename in file_index:
                same_type = [x["full_path"] for x in file_index[target_basename] if x["model_type"] == standard_type]
                diff_type = [x["full_path"] for x in file_index[target_basename] if x["model_type"] == "diffusion_models"]
                other_type = [x["full_path"] for x in file_index[target_basename] if x["model_type"] != standard_type and x["model_type"] != "diffusion_models"]
                
                if same_type: candidates = same_type
                elif diff_type: candidates = diff_type
                else: candidates = other_type

            # 校验存在性
            norm_current = norm_val.lower()
            norm_candidates = [normalize_path(c).lower() for c in candidates]
            if norm_current in norm_candidates: continue 

            # 获取下载链接
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

            # URL 类型嗅探
            if download_link:
                url_decoded = unquote(download_link).lower()
                if "diffusion_models" in url_decoded: final_download_type = "diffusion_models"
                elif "text_encoders" in url_decoded: final_download_type = "text_encoders"
                elif "/vae/" in url_decoded or "/vae." in url_decoded: final_download_type = "vae"
                elif "lora" in url_decoded: final_download_type = "loras"
                elif "/unet/" in url_decoded: final_download_type = "unet"
                elif "/clip/" in url_decoded: final_download_type = "clip"

            if candidates or download_link:
                results.append({
                    "id": item.get("id"), "widget_name": widget_type, "old_value": current_val,
                    "candidates": candidates, "download_url": download_link, "model_type": final_download_type
                })
                
        return web.json_response({"fixed": results})
    except Exception as e:
        return web.json_response({"fixed": [], "error": str(e)})