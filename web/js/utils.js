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

// 检测是否为子图节点（node.type 为 UUID）
function isSubgraphNode(nodeType) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nodeType);
}

// 加入 nodeType 验证，防止普通的 "model" 组件误报，但放行 llm 和 tts
export function isModelWidget(widgetName, nodeType = "") {
    if (!widgetName) return false;
    const name = widgetName.toLowerCase();
    const nType = nodeType.toLowerCase();
    
    // --- 防误判机制：放行包含 llm 和 tts 的节点 ---
    const genericNames = ["model", "模型", "vae", "clip", "text_encoder", "model_name", "模型名称"];
    if (genericNames.includes(name)) {
        // 子图节点（UUID类型）直接放行，提升的 widget 必然是模型相关的
        if (isSubgraphNode(nodeType)) {
            // 不拒绝，继续到下面的 EXACT_MATCH 检查
        } else if (!nType.includes("load") && !nType.includes("provider") && !nType.includes("dino") && !nType.includes("sam") && !nType.includes("llm") && !nType.includes("tts")) {
            return false; 
        }
    }
    
    const EXACT_MATCH = [
        "ckpt_name", "vae_name", "lora_name", "clip_name", 
        "clip_name1", "clip_name2", "clip_name3", 
        "unet_name", "control_net_name", "style_model_name", 
        "clip_vision_name", "upscale_model_name", "embedding_name",
        "diffusion_model_name", "text_encoder_name", 
        "audio_checkpoint_name", "audio_model_name", "latent_upscale_model_name",
        "model", "vae", "clip", "text_encoder", "model_name", "模型名称",
        "gligen_name", "hypernetwork_name", "audio_encoder_name", "photomaker_model_name",
        "embedding", "control_net_override",
        "controlnet名称", "风格模型名称", "clip名称", "checkpoint名称", 
        "gligen名称", "放大模型名称", "超网络名称", "音频编码器名称", 
        "照片制作 模型", "embedding嵌入", "control net名称", "control net覆盖", "lora名称",
        // 子图中文名称
        "文本编码器", "unet名称", "模型"
    ];
    
    if (EXACT_MATCH.includes(name)) return true;
    if (name.startsWith("clip_name")) return true;
    if (name.includes("text_encoder")) return true;
    if (name.includes("unet") && name.includes("name")) return true;
    
    // 子图后缀支持：unet_name_1, lora_name_1, clip_name_2 等
    if (/^(.+)_\d+$/.test(name)) {
        const baseName = name.replace(/_\d+$/, '');
        if (EXACT_MATCH.includes(baseName)) return true;
    }
    
    return false;
}