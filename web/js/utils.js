import { api } from "../../../scripts/api.js";

export function error(...args) { console.error("[Path-Fixer]", ...args); }
export function log(...args) { console.log("[Path-Fixer]", ...args); }

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
    } catch (e) { return []; }
}

export async function downloadModelFromServer(url, filename, modelType) {
    try {
        const response = await api.fetchApi("/model_path_fixer/download", {
            method: "POST",
            body: JSON.stringify({ url, model_type: modelType, source: "HF Mirror" }),
            headers: { "Content-Type": "application/json" }
        });
        if (!response.ok) throw new Error(`Network Error: ${response.status}`);
        return await response.json(); 
    } catch (e) { return { success: false, message: e.message }; }
}

export async function cancelDownloadFromServer(filename) {
    try {
        const response = await api.fetchApi("/model_path_fixer/cancel", {
            method: "POST",
            body: JSON.stringify({ filename }),
            headers: { "Content-Type": "application/json" }
        });
        return await response.json();
    } catch (e) { return { success: false, message: e.message }; }
}

// 新增 nodeType 参数用于交叉验证
export function isModelWidget(widgetName, nodeType = "") {
    if (!widgetName) return false;
    const name = widgetName.toLowerCase();
    const nType = nodeType.toLowerCase();
    
    // --- 核心修复：防误判机制 ---
    // 如果挂件名是非常泛用的词汇（如 model, 模型, vae, clip），
    // 那么必须要求这个节点的英文名字里包含加载器的特征词（load, provider 等），否则直接跳过扫描！
    const genericNames = ["model", "模型", "vae", "clip", "text_encoder"];
    if (genericNames.includes(name)) {
        if (!nType.includes("load") && !nType.includes("provider") && !nType.includes("dino") && !nType.includes("sam")) {
            return false; 
        }
    }
    
    const EXACT_MATCH = [
        // --- 基础挂件名 ---
        "ckpt_name", "vae_name", "lora_name", "clip_name", 
        "clip_name1", "clip_name2", "clip_name3", 
        "unet_name", "control_net_name", "style_model_name", 
        "clip_vision_name", "upscale_model_name", "embedding_name",
        "diffusion_model_name", "text_encoder_name", 
        "audio_checkpoint_name", "audio_model_name", "latent_upscale_model_name",
        "model", "vae", "clip", "text_encoder", "model_name", "模型名称",
        
        // --- 保留下来的特殊英文挂件名 ---
        "gligen_name", "hypernetwork_name", "audio_encoder_name", "photomaker_model_name",
        "embedding", "control_net_override",
        
        // --- 保留下来的中文翻译挂件名 ---
        "controlnet名称", "风格模型名称", "clip名称", "checkpoint名称", 
        "gligen名称", "放大模型名称", "超网络名称", "音频编码器名称", 
        "照片制作 模型", "embedding嵌入", "control net名称", "control net覆盖", "lora名称"
    ];
    
    if (EXACT_MATCH.includes(name)) return true;
    if (name.startsWith("clip_name")) return true;
    if (name.includes("text_encoder")) return true;
    if (name.includes("unet") && name.includes("name")) return true;
    return false;
}