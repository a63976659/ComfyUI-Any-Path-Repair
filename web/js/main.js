import { app } from "../../../scripts/app.js";
import { error, log, isModelWidget, fetchFixPaths } from "./utils.js";
import { FixerUI } from "./ui.js";

const CATEGORY_MAP = {
    "diffusion_models": "unet",
    "checkpoints": "checkpoints",
    "text_encoders": "clip",
    "model_patches": "loras",
    "loras": "loras",
    "vae": "vae",
    "controlnet": "controlnet",
    "upscale_models": "upscale_models",
    "audio_encoders": "audio_checkpoints"
};

function extractLinksFromWorkflow(graph) {
    const dynamicLinks = {}; 
    const startTime = Date.now();
    const TIMEOUT_MS = 3000; 

    console.log("[PathFixer] 开始扫描工作区链接...");

    for (const node of graph._nodes) {
        if (Date.now() - startTime > TIMEOUT_MS) {
            console.warn(`[PathFixer] ⚠️ 工作区扫描超时 (> ${TIMEOUT_MS}ms)，已跳过剩余节点检测。`);
            break; 
        }

        if (!node.widgets) continue;

        for (const widget of node.widgets) {
            if (typeof widget.value !== "string" || !widget.value.includes("](") || !widget.value.includes("http")) {
                continue;
            }

            const text = widget.value;
            const lines = text.split("\n");
            let currentCategory = "unknown";

            for (const line of lines) {
                const trimmed = line.trim();
                const headerMatch = trimmed.match(/^(?:\*\*|\#\#)\s*([a-zA-Z0-9_\-]+)/);
                if (headerMatch) {
                    const rawHeader = headerMatch[1].toLowerCase();
                    currentCategory = CATEGORY_MAP[rawHeader] || rawHeader;
                    continue;
                }

                const linkMatch = trimmed.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
                if (linkMatch) {
                    const fileName = linkMatch[1].trim();
                    const url = linkMatch[2].trim();
                    if (!dynamicLinks[currentCategory]) {
                        dynamicLinks[currentCategory] = {};
                    }
                    dynamicLinks[currentCategory][fileName] = url;
                }
            }
        }
    }
    return dynamicLinks;
}

async function executePathFix(uiInstance) {
    const graph = app.graph;
    const queries = [];
    
    uiInstance.setButtonState(true, "扫描中...");
    const dynamicLinks = extractLinksFromWorkflow(graph);
    
    try {
        for (const node of graph._nodes) {
            if (!node.widgets) continue;
            for (const widget of node.widgets) {
                if (isModelWidget(widget.name) && typeof widget.value === "string") {
                    queries.push({
                        id: node.id,
                        widget_name: widget.name,
                        current_val: widget.value,
                        type: widget.name
                    });
                }
            }
        }

        if (queries.length === 0) {
            alert("当前工作流中未发现可修复的模型节点。");
            uiInstance.setButtonState(false);
            return;
        }

        uiInstance.setButtonState(true, "匹配中...");
        
        const data = await fetchFixPaths(queries, dynamicLinks);
        const results = data.fixed || [];

        if (results.length === 0) {
            // [修改] 提示语更简洁
            alert("✅ 模型路径正确");
            uiInstance.setButtonState(false);
            return;
        }

        const autoFixes = [];
        const conflicts = [];
        const downloads = [];
        const unknowns = [];

        results.forEach(res => {
            if (res.candidates.length === 0) {
                if (res.download_url) {
                    downloads.push(res);
                } else {
                    unknowns.push(res);
                }
            } else if (res.candidates.length === 1) {
                autoFixes.push({
                    id: res.id,
                    widget_name: res.widget_name,
                    new_value: res.candidates[0],
                    old_value: res.old_value
                });
            } else {
                conflicts.push(res);
            }
        });

        let fixedCount = 0;

        if (autoFixes.length > 0) {
            applyFixes(graph, autoFixes);
            fixedCount += autoFixes.length;
        }

        if (conflicts.length > 0 || downloads.length > 0 || unknowns.length > 0) {
            uiInstance.setButtonState(true, "等待操作...");
            uiInstance.showResultDialog(conflicts, downloads, unknowns, (userSelectionMap) => {
                const manualFixes = [];
                conflicts.forEach(conflict => {
                    const key = `${conflict.id}-${conflict.widget_name}`;
                    const selectedPath = userSelectionMap.get(key);
                    if (selectedPath) {
                        manualFixes.push({
                            id: conflict.id,
                            widget_name: conflict.widget_name,
                            new_value: selectedPath,
                            old_value: conflict.old_value
                        });
                    }
                });
                applyFixes(graph, manualFixes);
                fixedCount += manualFixes.length;
                finishProcess(uiInstance, graph, fixedCount);
            });
        } else {
            finishProcess(uiInstance, graph, fixedCount);
        }

    } catch (e) {
        error("执行修复流程出错:", e);
        alert("修复过程发生错误，请查看控制台 (F12)。");
    } finally {
        setTimeout(() => {
            const dialog = document.querySelector(".fixer-dialog-overlay");
            if (!dialog) {
                uiInstance.setButtonState(false);
            }
        }, 500);
    }
}

function ensureWidgetOption(widget, targetPath) {
    if (!widget.options || !widget.options.values) return targetPath;
    const values = widget.options.values;
    const normalizedTarget = targetPath.replace(/\\/g, "/").toLowerCase();
    for (const option of values) {
        if (typeof option !== "string") continue;
        const normalizedOption = option.replace(/\\/g, "/").toLowerCase();
        if (normalizedOption === normalizedTarget) return option; 
    }
    widget.options.values.push(targetPath);
    return targetPath;
}

function applyFixes(graph, fixList) {
    for (const fix of fixList) {
        const node = graph.getNodeById(fix.id);
        if (node) {
            const widget = node.widgets.find(w => w.name === fix.widget_name);
            if (widget) {
                const finalValue = ensureWidgetOption(widget, fix.new_value);
                widget.value = finalValue;
                if (widget.callback) widget.callback(widget.value, graph, node, {}, {});
                if (node.onResize) node.onResize(node.size);
            }
        }
    }
}

function finishProcess(uiInstance, graph, count) {
    if (count > 0) {
        app.graph.setDirtyCanvas(true, true);
        setTimeout(() => {
            alert(`✅ 成功修复了 ${count} 个模型路径！\n如果有手动下载的模型，请下载后点击刷新。`);
        }, 100);
        uiInstance.setButtonState(false, `已修复 ${count}`);
    } else {
        // 如果这里也想统一提示，也可以改成：
        // alert("✅ 模型路径正确");
        uiInstance.setButtonState(false);
    }
    setTimeout(() => uiInstance.setButtonState(false), 2000);
}

app.registerExtension({
    name: "ComfyUI.ModelPathFixer",
    async setup(app) {
        const ui = new FixerUI(executePathFix);
        setTimeout(() => {
            ui.addPanelButtons(app);
        }, 500);
    }
});