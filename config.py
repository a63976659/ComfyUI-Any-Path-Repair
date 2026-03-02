import os
import folder_paths

# 基础修正映射
MANUAL_MAPPING = {
    "ckpt_name": "checkpoints",
    "vae_name": "vae",
    "lora_name": "loras",
    "unet_name": "unet",
    "diffusion_model_name": "diffusion_models", # 精确映射
    "clip_name": "clip",
    "clip_name1": "clip", 
    "clip_name2": "clip",
    "clip_name3": "clip",
    "text_encoder_name": "text_encoders",       # 精确映射
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

def get_type_mapping():
    mapping = MANUAL_MAPPING.copy()
    for type_name in folder_paths.folder_names_and_paths:
        widget_key = f"{type_name}_name"
        if widget_key not in mapping:
            mapping[widget_key] = type_name
    return mapping

# 额外路径注册
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
        folder_paths.add_model_folder_path(folder_name, target_path)
        try:
            folder_paths.add_model_folder_path(comfy_type, target_path)
        except: pass