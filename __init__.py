import server
from aiohttp import web
import folder_paths
import os
import json

# 定义支持的模型类型映射
# 左侧是前端组件名 (Widget Name)，右侧是 ComfyUI 文件夹名 (Folder Name)
TYPE_MAPPING = {
    # 基础模型
    "ckpt_name": "checkpoints",
    "vae_name": "vae",
    "lora_name": "loras",             # 对应 model_patches
    
    # 扩散与文本编码
    "unet_name": "unet",              # 对应 diffusion_models
    "diffusion_model_name": "unet",   # 兼容部分节点的命名
    "clip_name": "clip",              # 对应 text_encoders
    "text_encoder_name": "clip",      # 兼容部分节点的命名
    
    # 控制与风格
    "control_net_name": "controlnet",
    "style_model_name": "style_models",
    "clip_vision_name": "clip_vision",
    
    # 放大与嵌入
    "upscale_model_name": "upscale_models",
    "embedding_name": "embeddings",
    
    # 新增支持
    "audio_checkpoint_name": "audio_checkpoints", # 对应 audio_encoders
    "audio_model_name": "audio_checkpoints",      # 兼容不同音频节点
    "latent_upscale_model_name": "latent_upscale_models" 
}

def normalize_path(path):
    if not path:
        return ""
    norm = path.replace("\\", "/")
    if norm.startswith("./"):
        norm = norm[2:]
    return norm.strip()

def load_local_links():
    """
    [优化] 一次性读取并缓存本地 JSON 文件
    """
    try:
        current_dir = os.path.dirname(os.path.realpath(__file__))
        json_path = os.path.join(current_dir, "model_links.json")
        
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"❌ [Model Path Fixer] JSON 读取失败: {e}")
    
    return {} # 读取失败返回空字典

def find_all_matching_paths(model_type, filename):
    if model_type not in TYPE_MAPPING.values():
        return []
    try:
        # 获取该类型下的所有文件名
        available_files = folder_paths.get_filename_list(model_type)
    except:
        return []
        
    target_basename = os.path.basename(normalize_path(filename))
    matches = []
    
    # 遍历查找匹配项
    for file_path in available_files:
        if os.path.basename(normalize_path(file_path)) == target_basename:
            matches.append(file_path)
            
    return matches

@server.PromptServer.instance.routes.post("/model_path_fixer/fix")
async def fix_model_paths(request):
    try:
        json_data = await request.json()
        query_list = json_data.get("queries", [])
        dynamic_links = json_data.get("dynamic_links", {})
        
        # [核心优化] 在循环开始前，先把本地数据库读进内存！
        # 这样无论有多少个节点，只读一次硬盘。
        local_links_db = load_local_links()
        
        results = []
        
        for item in query_list:
            current_val = item.get("current_val")
            widget_type = item.get("type")
            
            model_type = TYPE_MAPPING.get(widget_type)
            
            if not current_val or not isinstance(current_val, str) or not model_type:
                continue
                
            # 1. 查找本地文件
            candidates = find_all_matching_paths(model_type, current_val)
            
            if candidates:
                # 检查是否已经正确
                norm_current = normalize_path(current_val).lower()
                norm_candidates = [normalize_path(c).lower() for c in candidates]
                
                if norm_current in norm_candidates:
                    continue

                results.append({
                    "id": item.get("id"),
                    "widget_name": widget_type,
                    "old_value": current_val,
                    "candidates": candidates,
                    "download_url": None,
                    "model_type": model_type
                })
            
            else:
                # 2. 查找下载链接 (优先看 dynamic_links，其次看 local_links_db)
                target_name = os.path.basename(normalize_path(current_val))
                download_link = None
                
                # A. 检查动态链接 (前端提取的)
                if model_type in dynamic_links and target_name in dynamic_links[model_type]:
                    download_link = dynamic_links[model_type][target_name]
                
                # B. 检查本地数据库 (刚读入内存的)
                elif model_type in local_links_db and target_name in local_links_db[model_type]:
                    download_link = local_links_db[model_type][target_name]

                results.append({
                    "id": item.get("id"),
                    "widget_name": widget_type,
                    "old_value": current_val,
                    "candidates": [],
                    "download_url": download_link,
                    "model_type": model_type
                })
                
        return web.json_response({"fixed": results})

    except Exception as e:
        print(f"❌ [Model Path Fixer] 后端严重错误: {e}")
        return web.json_response({"fixed": [], "error": str(e)})

# 必须保留的映射
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"
print("🔧 Model Path Fixer: Loaded (Optimized).")