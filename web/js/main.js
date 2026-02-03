import { app } from "../../../scripts/app.js";
import { error, log, isModelWidget, fetchFixPaths, fetchActiveDownloads } from "./utils.js";
import { FixerUI } from "./ui.js";

// [核心] 全局缓存，用于在重新打开 UI 时恢复上一次的扫描结果
let cachedScanResult = {
    conflicts: [],
    downloads: [],
    unknowns: []
};

function extractLinksFromWorkflow(graph) {
    const dynamicLinks = {}; 
    const TIMEOUT_MS = 3000; 
    const startTime = Date.now();
    dynamicLinks["uncategorized"] = {};

    for (const node of graph._nodes) {
        if (Date.now() - startTime > TIMEOUT_MS) break;
        if (!node.widgets) continue;

        for (const widget of node.widgets) {
            if (typeof widget.value !== "string" || !widget.value.includes("http")) continue;

            const text = widget.value;
            const lines = text.split("\n");
            let currentCategory = "uncategorized";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const headerMatch = trimmed.match(/^(?:\*\*|\#\#)?\s*([a-zA-Z0-9_\-\s]+?)(?:\s*\*\*)?(?:\s*:)?$/);
                if (headerMatch) {
                    if (!trimmed.includes("http") && !trimmed.includes("]")) {
                        currentCategory = headerMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
                        continue;
                    }
                }
                const linkMatch = trimmed.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
                if (linkMatch) {
                    const fileName = linkMatch[1].trim();
                    const url = linkMatch[2].trim();
                    if (!dynamicLinks[currentCategory]) dynamicLinks[currentCategory] = {};
                    dynamicLinks[currentCategory][fileName] = url;
                }
            }
        }
    }
    return dynamicLinks;
}

async function executePathFix(uiInstance) {
    const graph = app.graph;
    
    // ============================================
    // [核心需求] 1. 先检查后台是否有下载任务
    // ============================================
    const activeDownloads = await fetchActiveDownloads();
    if (activeDownloads.length > 0) {
        // 如果有正在下载的任务，且我们有缓存，直接恢复 UI
        // 这样点击“修复”按钮变成了“查看状态”功能
        console.log("[PathFixer] 检测到后台任务，恢复 UI 界面");
        uiInstance.setButtonState(true, "查看状态..."); // 瞬间状态
        
        // 恢复上次的数据，这样用户能看到那个下载按钮
        // 如果没有缓存（比如刷新过页面），可能需要重新扫描，但为了安全我们只显示状态
        uiInstance.showResultDialog(
            cachedScanResult.conflicts, 
            cachedScanResult.downloads, 
            cachedScanResult.unknowns, 
            (map) => applyFixes(graph, map) // 保持 callback
        );
        uiInstance.setButtonState(false); // 恢复按钮可点
        return;
    }

    // ============================================
    // 2. 正常流程：没有下载任务，开始扫描
    // ============================================
    
    const queries = [];
    uiInstance.setButtonState(true, "扫描中...");
    
    // 清空缓存
    cachedScanResult = { conflicts: [], downloads: [], unknowns: [] };

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
            alert("✅ 所有模型路径均正确，无需修复。");
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
                autoFixes.push({ id: res.id, widget_name: res.widget_name, new_value: res.candidates[0], old_value: res.old_value });
            } else {
                conflicts.push(res);
            }
        });

        // 更新缓存
        cachedScanResult = { conflicts, downloads, unknowns };

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
                        manualFixes.push({ id: conflict.id, widget_name: conflict.widget_name, new_value: selectedPath, old_value: conflict.old_value });
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
        uiInstance.setButtonState(false);
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
        uiInstance.setButtonState(false, `已修复 ${count}`);
    } else {
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