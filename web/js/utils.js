import { api } from "../../../scripts/api.js";

export function error(...args) {
    console.error("[Path-Fixer]", ...args);
}

export function log(...args) {
    console.log("[Path-Fixer]", ...args);
}

export async function fetchFixPaths(queries, dynamicLinks = {}) {
    try {
        const response = await api.fetchApi("/model_path_fixer/fix", {
            method: "POST",
            body: JSON.stringify({ queries, dynamic_links: dynamicLinks }),
            headers: { "Content-Type": "application/json" }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return await response.json();
    } catch (e) {
        error("请求后端失败:", e);
        return { fixed: [] };
    }
}

export async function fetchActiveDownloads() {
    try {
        const response = await api.fetchApi("/model_path_fixer/active_tasks");
        if (!response.ok) return [];
        const data = await response.json();
        return data.active || [];
    } catch (e) {
        return [];
    }
}

export async function downloadModelFromServer(url, filename, modelType) {
    try {
        const response = await api.fetchApi("/model_path_fixer/download", {
            method: "POST",
            body: JSON.stringify({
                url: url,
                model_type: modelType,
                source: "HF Mirror" 
            }),
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error(`Network Error: ${response.status}`);
        return await response.json(); 
    } catch (e) {
        return { success: false, message: e.message };
    }
}

// [新增] 中断下载
export async function cancelDownloadFromServer(filename) {
    try {
        const response = await api.fetchApi("/model_path_fixer/cancel", {
            method: "POST",
            body: JSON.stringify({ filename: filename }),
            headers: { "Content-Type": "application/json" }
        });
        return await response.json();
    } catch (e) {
        return { success: false, message: e.message };
    }
}

export function isModelWidget(widgetName) {
    if (!widgetName) return false;
    const name = widgetName.toLowerCase();
    
    const EXACT_MATCH = [
        "ckpt_name", "vae_name", "lora_name", "clip_name", 
        "clip_name1", "clip_name2", "clip_name3", 
        "unet_name", "control_net_name", "style_model_name", 
        "clip_vision_name", "upscale_model_name", "embedding_name",
        "diffusion_model_name", "text_encoder_name", 
        "audio_checkpoint_name", "audio_model_name", "latent_upscale_model_name",
        "model", "vae", "clip", "text_encoder"
    ];
    if (EXACT_MATCH.includes(name)) return true;

    if (name.startsWith("clip_name")) return true;
    if (name.includes("text_encoder")) return true;
    if (name.includes("unet") && name.includes("name")) return true;

    return false;
}