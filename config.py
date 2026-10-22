import os
import re

import folder_paths


TYPE_ALIASES = {"unet": "diffusion_models", "clip": "text_encoders", "llm": "LLM", "tts": "TTS"}
NON_MODEL_TYPES = {"custom_nodes", "configs", "datasets"}
MANUAL_MAPPING = {
    "ckpt_name": "checkpoints", "checkpoint名称": "checkpoints",
    "vae_name": "vae", "vae": "vae", "lora_name": "loras", "lora名称": "loras",
    "unet_name": "diffusion_models", "unet名称": "diffusion_models", "diffusion_model_name": "diffusion_models",
    "clip_name": "text_encoders", "clip_name1": "text_encoders", "clip_name2": "text_encoders", "clip_name3": "text_encoders",
    "clip": "text_encoders", "clip名称": "text_encoders", "text_encoder_name": "text_encoders", "text_encoder": "text_encoders", "文本编码器": "text_encoders",
    "control_net_name": "controlnet", "control_net_override": "controlnet", "controlnet名称": "controlnet", "control net名称": "controlnet", "control net覆盖": "controlnet",
    "style_model_name": "style_models", "风格模型名称": "style_models", "clip_vision_name": "clip_vision",
    "upscale_model_name": "upscale_models", "放大模型名称": "upscale_models",
    "embedding_name": "embeddings", "embedding": "embeddings", "embedding嵌入": "embeddings",
    "audio_checkpoint_name": "audio_checkpoints", "audio_model_name": "audio_checkpoints", "audio_encoder_name": "audio_checkpoints", "音频编码器名称": "audio_checkpoints",
    "latent_upscale_model_name": "latent_upscale_models", "gligen_name": "gligen", "gligen名称": "gligen",
    "hypernetwork_name": "hypernetworks", "超网络名称": "hypernetworks",
    "photomaker_model_name": "photomaker", "照片制作 模型": "photomaker", "bg_removal_name": "background_removal",
    "vitpose_model": "detection", "yolo_model": "detection", "vit姿态模型": "detection", "yolo模型": "detection", "nlf_model": "nlf", "nlf模型": "nlf",
}
NODE_SPECIFIC_MAPPING = {
    "LatentUpscaleModelLoader": "latent_upscale_models", "UltralyticsDetectorProvider": "ultralytics",
    "UpscaleModelLoader": "upscale_models", "LTXVAudioVAELoader": "vae", "LoadWanVideoT5TextEncoder": "text_encoders",
    "Wav2VecModelLoader": "audio_checkpoints", "GroundingDinoModelLoader_SDPose": "grounding-dino",
    "AnimateDiffModuleLoader": "animatediff_models", "SAMLoader": "sams",
    "LLM_Chat_Node": "LLM", "LLM_Translator_Node": "LLM",
    "Qwen_TTS_Node": "TTS", "Qwen_TTS_VoiceDesign_Node": "TTS", "Qwen_TTS_VoiceClone_Node": "TTS",
    "LoadBackgroundRemovalModel": "background_removal", "LoadMediaPipeFaceLandmarker": "detection",
    "LoadMoGeModel": "geometry_estimation", "OnnxDetectionModelLoader": "detection", "LoadNLFModel": "nlf",
}
SCOPED_WIDGETS = {name: ["onnx"] for name in ("vitpose_model", "yolo_model", "vit姿态模型", "yolo模型")}
GENERIC_WIDGETS = ["model", "模型", "model_name", "模型名称", "vae", "clip", "text_encoder"]
LOADER_KEYWORDS = ["load", "provider", "dino", "llm", "tts", "landmarker", "removal", "moge"]
WIDGET_PATTERNS = [{"pattern": r"^clip_name\d+$", "model_type": "text_encoders"}]


def canonical_type(name):
    if name is not None and not isinstance(name, str):
        raise ValueError("模型类型必须是字符串")
    return TYPE_ALIASES.get(name.casefold(), name) if name else None


def get_type_mapping():
    mapping = MANUAL_MAPPING.copy()
    for name in folder_paths.folder_names_and_paths:
        if name not in NON_MODEL_TYPES:
            mapping.setdefault(f"{name.casefold()}_name", canonical_type(name))
    return mapping


def get_model_rules():
    return {
        "widget_types": get_type_mapping(),
        "node_types": {name.casefold(): canonical_type(value) for name, value in NODE_SPECIFIC_MAPPING.items()},
        "scoped_widgets": SCOPED_WIDGETS,
        "generic_widgets": GENERIC_WIDGETS,
        "loader_keywords": LOADER_KEYWORDS,
        "widget_patterns": WIDGET_PATTERNS,
    }


def resolve_model_type(widget_name, node_type, current_value=""):
    rules = get_model_rules()
    name = re.sub(r"_\d+$", "", widget_name.casefold())
    scoped = SCOPED_WIDGETS.get(name)
    is_subgraph = bool(re.fullmatch(r"[0-9a-fA-F-]{36}", node_type))
    if scoped and not is_subgraph and not any(key in node_type.casefold() for key in scoped):
        return None
    model_type = rules["node_types"].get(node_type.casefold()) or rules["widget_types"].get(widget_name.casefold())
    model_type = model_type or rules["widget_types"].get(name)
    if not model_type:
        model_type = next((rule["model_type"] for rule in WIDGET_PATTERNS if re.fullmatch(rule["pattern"], name)), None)
    if not model_type:
        prefix = current_value.replace("\\", "/").split("/")[0]
        for registered in folder_paths.folder_names_and_paths:
            if registered not in NON_MODEL_TYPES and registered.casefold() == prefix.casefold():
                return canonical_type(registered)
    return canonical_type(model_type)


def register_custom_paths():
    for name in ("background_removal", "detection", "geometry_estimation", "nlf", "LLM", "TTS", "audio_checkpoints"):
        if name not in folder_paths.folder_names_and_paths:
            folder_paths.folder_names_and_paths[name] = ([os.path.join(folder_paths.models_dir, name)], set(folder_paths.supported_pt_extensions))
    paths, extensions = folder_paths.folder_names_and_paths["detection"]
    folder_paths.folder_names_and_paths["detection"] = (paths, set(extensions) | {".onnx"})
