import server
from aiohttp import web
import folder_paths
import os

# 定义支持的模型类型映射
TYPE_MAPPING = {
    "ckpt_name": "checkpoints",
    "vae_name": "vae",
    "lora_name": "loras",
    "clip_name": "clip",
    "unet_name": "unet",
    "control_net_name": "controlnet",
    "style_model_name": "style_models",
    "clip_vision_name": "clip_vision",
    "upscale_model_name": "upscale_models",
    "embedding_name": "embeddings"
}

def normalize_path(path):
    """
    标准化路径：统一使用 / 作为分隔符，并去除首尾空格
    用于解决 Windows 反斜杠导致的匹配失败问题
    """
    if not path:
        return ""
    # 将反斜杠替换为正斜杠
    norm = path.replace("\\", "/")
    # 去除多余的 ./ 前缀 (如果有)
    if norm.startswith("./"):
        norm = norm[2:]
    return norm.strip()

def find_all_matching_paths(model_type, filename):
    """
    返回所有匹配文件名的路径列表
    """
    if model_type not in TYPE_MAPPING.values():
        return []
    
    try:
        available_files = folder_paths.get_filename_list(model_type)
    except:
        return []
        
    target_basename = os.path.basename(normalize_path(filename))
    matches = []

    # 遍历所有文件，找到所有 basename 相同的文件
    for file_path in available_files:
        # 同样标准化文件名进行对比
        if os.path.basename(normalize_path(file_path)) == target_basename:
            matches.append(file_path)
            
    return matches

@server.PromptServer.instance.routes.post("/model_path_fixer/fix")
async def fix_model_paths(request):
    json_data = await request.json()
    query_list = json_data.get("queries", [])
    
    results = []
    
    for item in query_list:
        current_val = item.get("current_val")
        widget_type = item.get("type")
        
        model_type = TYPE_MAPPING.get(widget_type)
        
        if not current_val or not isinstance(current_val, str) or not model_type:
            continue
            
        # 获取所有可能的匹配项
        candidates = find_all_matching_paths(model_type, current_val)
        
        if candidates:
            # 关键修复：进行标准化的对比
            # 如果当前值(标准化后) 已经存在于 候选列表(标准化后) 中
            # 说明当前的路径已经是正确的，绝对不要乱动它！
            norm_current = normalize_path(current_val).lower() # 忽略大小写
            norm_candidates = [normalize_path(c).lower() for c in candidates]
            
            if norm_current in norm_candidates:
                continue

            results.append({
                "id": item.get("id"),
                "widget_name": widget_type,
                "old_value": current_val,
                "candidates": candidates
            })
            
    return web.json_response({"fixed": results})

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"
print("🔧 Model Path Fixer: Loaded.")