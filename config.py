import os
import folder_paths

# ================= 动态路径映射 =================
# 1. 基础修正映射 (高优先级)
# 修改说明: 
# 将 diffusion_model_name 指向 diffusion_models 文件夹，而不是 unet
# 将 text_encoder_name 指向 text_encoders 文件夹，而不是 clip
MANUAL_MAPPING = {
    "ckpt_name": "checkpoints",
    "vae_name": "vae",
    "lora_name": "loras",
    "unet_name": "unet",  # unet_name 依然保留在 unet 文件夹
    
    # [核心修改] 精确映射到 diffusion_models 文件夹
    "diffusion_model_name": "diffusion_models", 
    
    "clip_name": "clip",
    "clip_name1": "clip", 
    "clip_name2": "clip",
    "clip_name3": "clip",
    
    # [核心修改] 精确映射到 text_encoders 文件夹
    "text_encoder_name": "text_encoders", 
    "text_encoder": "text_encoders",
    
    "control_net_name": "controlnet",
    "style_model_name": "style_models",
    "clip_vision_name": "clip_vision",
    "upscale_model_name": "upscale_models",
    "embedding_name": "embeddings",
    "audio_checkpoint_name": "audio_checkpoints",
    "audio_model_name": "audio_checkpoints",
    "latent_upscale_model_name": "latent_upscale_models" 
}

# 2. 动态生成映射
def get_type_mapping():
    mapping = MANUAL_MAPPING.copy()
    for type_name in folder_paths.folder_names_and_paths:
        widget_key = f"{type_name}_name"
        if widget_key not in mapping:
            mapping[widget_key] = type_name
    return mapping

# ================= 路径注册 =================
EXTRA_PATH_REGISTRATIONS = {
    "text_encoders": "clip",
    "diffusion_models": "unet",
    "model_patches": "loras",
    "audio_encoders": "audio_checkpoints"
}

def register_custom_paths():
    models_dir = folder_paths.models_dir
    for folder_name, comfy_type in EXTRA_PATH_REGISTRATIONS.items():
        target_path = os.path.join(models_dir, folder_name)
        
        # 1. 注册物理文件夹 (例如 diffusion_models)
        # 这一步确保了 folder_paths.get_folder_paths("diffusion_models") 能返回正确路径
        folder_paths.add_model_folder_path(folder_name, target_path)
        
        try:
            # 2. 注册逻辑类型 (例如让 unet 类型也能去 diffusion_models 找文件)
            # 这一步确保加载器能读取到文件，不影响下载路径
            folder_paths.add_model_folder_path(comfy_type, target_path)
        except: pass