/**
 * ComfyUI-Model-Path-Fixer 工具模块
 */

import { api } from "../../../scripts/api.js";

/**
 * 统一错误日志
 */
export function error(...args) {
    console.error("[Path-Fixer]", ...args);
}

/**
 * 统一信息日志
 */
export function log(...args) {
    console.log("[Path-Fixer]", ...args);
}

/**
 * 调用后端修复接口
 * [核心修改] 增加了 dynamicLinks 参数，用于发送从工作流 Note 中提取的链接
 * @param {Array} queries 需要查询的节点列表
 * @param {Object} dynamicLinks 从前端提取的动态链接字典
 */
export async function fetchFixPaths(queries, dynamicLinks = {}) {
    try {
        const response = await api.fetchApi("/model_path_fixer/fix", {
            method: "POST",
            // 将 queries 和 dynamic_links 一起打包发给后端
            body: JSON.stringify({ 
                queries: queries,
                dynamic_links: dynamicLinks 
            }),
            headers: { "Content-Type": "application/json" }
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (e) {
        error("请求后端失败:", e);
        return { fixed: [] };
    }
}

/**
 * 组件名称到模型类型的映射检查
 * @param {string} widgetName 
 * @returns {boolean}
 */
export function isModelWidget(widgetName) {
    const TARGET_WIDGETS = [
        "ckpt_name", "vae_name", "lora_name", "clip_name", 
        "unet_name", "control_net_name", "style_model_name", 
        "clip_vision_name", "upscale_model_name", "embedding_name"
    ];
    return TARGET_WIDGETS.includes(widgetName);
}