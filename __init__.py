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

def find_correct_path(model_type, filename):
    if model_type not in TYPE_MAPPING.values():
        return None
    
    # 获取该类型所有文件
    try:
        available_files = folder_paths.get_filename_list(model_type)
    except:
        return None
        
    target_basename = os.path.basename(filename)
    
    # 1. 完全匹配
    if filename in available_files:
        return filename
        
    # 2. 文件名匹配
    for file_path in available_files:
        if os.path.basename(file_path) == target_basename:
            return file_path
            
    return None

@server.PromptServer.instance.routes.post("/model_path_fixer/fix")
async def fix_model_paths(request):
    json_data = await request.json()
    query_list = json_data.get("queries", [])
    results = []
    
    for item in query_list:
        current_val = item.get("current_val")
        widget_type = item.get("type") # 这里前端传来的其实是 widget name
        
        # 映射 widget name 到 folder_path type
        model_type = TYPE_MAPPING.get(widget_type)
        
        if not current_val or not isinstance(current_val, str) or not model_type:
            continue
            
        new_path = find_correct_path(model_type, current_val)
        
        if new_path and new_path != current_val:
            results.append({
                "id": item.get("id"),
                "widget_name": widget_type,
                "new_value": new_path,
                "old_value": current_val
            })
            
    return web.json_response({"fixed": results})

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"
print("🔧 Model Path Fixer: Loaded.")