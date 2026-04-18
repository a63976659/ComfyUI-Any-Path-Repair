import os
import folder_paths

# 基础修正映射
MANUAL_MAPPING = {
    "ckpt_name": "checkpoints",
    "vae_name": "vae",
    "lora_name": "loras",
    "unet_name": "unet",
    "diffusion_model_name": "diffusion_models", 
    "clip_name": "clip",
    "clip_name1": "clip", 
    "clip_name2": "clip",
    "clip_name3": "clip",
    "text_encoder_name": "text_encoders",       
    "text_encoder": "clip",
    "control_net_name": "controlnet",
    "control_net_override": "controlnet",
    "style_model_name": "style_models",
    "clip_vision_name": "clip_vision",
    "upscale_model_name": "upscale_models",
    "embedding_name": "embeddings",
    "embedding": "embeddings",
    "audio_checkpoint_name": "audio_checkpoints",
    "audio_model_name": "audio_checkpoints",
    "audio_encoder_name": "audio_checkpoints",
    "latent_upscale_model_name": "latent_upscale_models",
    "model_name": "latent_upscale_models",
    "gligen_name": "gligen",
    "hypernetwork_name": "hypernetworks",
    "photomaker_model_name": "photomaker",
    # 子图中文名称映射
    "文本编码器": "clip",
    "模型": "latent_upscale_models",
    "UNet名称": "unet",
    "LoRA名称": "loras",
    "Checkpoint名称": "checkpoints"
}

# 基于节点类型的精确映射
NODE_SPECIFIC_MAPPING = {
    "LatentUpscaleModelLoader": "latent_upscale_models",
    "UltralyticsDetectorProvider": "ultralytics",
    "UpscaleModelLoader": "upscale_models",
    "LTXVAudioVAELoader": "vae",
    "LoadWanVideoT5TextEncoder": "text_encoders",
    "Wav2VecModelLoader": "audio_checkpoints",
    "GroundingDinoModelLoader_SDPose": "grounding-dino",
    "AnimateDiffModuleLoader": "animatediff_models",
    "SAMLoader": "sams",
    
    # --- 新增：大语言模型与语音模型节点的专属映射 ---
    "LLM_Chat_Node": "LLM",
    "LLM_Translator_Node": "LLM",
    "Qwen_TTS_Node": "TTS",
    "Qwen_TTS_VoiceDesign_Node": "TTS",
    "Qwen_TTS_VoiceClone_Node": "TTS"
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