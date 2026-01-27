
import { app } from "../../../scripts/app.js";
import { error, log, isModelWidget, fetchFixPaths } from "./utils.js";
import { FixerUI } from "./ui.js";

async function executePathFix(uiInstance) {
    const graph = app.graph;
    const queries = [];
    
    uiInstance.setButtonState(true, "扫描中...");
    
    try {
        // 1. 扫描节点
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

        // 2. 发送请求
        uiInstance.setButtonState(true, "匹配中...");
        const data = await fetchFixPaths(queries);
        const results = data.fixed || [];

        if (results.length === 0) {
            alert("未发现路径问题，所有模型路径看似正确或本地不存在对应文件。");
            uiInstance.setButtonState(false);
            return;
        }

        // 3. 分类结果
        const autoFixes = [];
        const conflicts = [];

        results.forEach(res => {
            if (res.candidates.length === 1) {
                autoFixes.push({
                    id: res.id,
                    widget_name: res.widget_name,
                    new_value: res.candidates[0],
                    old_value: res.old_value
                });
            } else if (res.candidates.length > 1) {
                conflicts.push(res);
            }
        });

        let fixedCount = 0;

        // 4. 应用自动修复
        if (autoFixes.length > 0) {
            applyFixes(graph, autoFixes);
            fixedCount += autoFixes.length;
        }

        // 5. 处理冲突
        if (conflicts.length > 0) {
            uiInstance.setButtonState(true, "等待选择...");
            
            uiInstance.showConflictDialog(conflicts, (userSelectionMap) => {
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
        uiInstance.setButtonState(false, "错误");
        alert("修复过程发生错误，请查看控制台。");
    }
}

/**
 * 辅助函数：查找并确保选项存在
 * 增加去重检查，防止因为反复修复导致下拉列表出现重复项
 */
function ensureWidgetOption(widget, targetPath) {
    if (!widget.options || !widget.options.values) return targetPath;
    
    const values = widget.options.values;
    const normalizedTarget = targetPath.replace(/\\/g, "/").toLowerCase();
    
    // 遍历现有选项，进行宽松匹配
    for (const option of values) {
        if (typeof option !== "string") continue;
        const normalizedOption = option.replace(/\\/g, "/").toLowerCase();
        
        // 如果找到了完全一样的路径（忽略斜杠和大小写），直接使用列表里现有的
        if (normalizedOption === normalizedTarget) {
            return option; 
        }
    }

    // 只有在真的找不到时，才添加
    console.log(`[PathFixer] 前端列表缺少路径 "${targetPath}"，注入选项。`);
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
                
                if (widget.callback) {
                    widget.callback(widget.value, graph, node, {}, {});
                }
                
                if (node.onResize) {
                    node.onResize(node.size);
                }
            }
        }
    }
}

function finishProcess(uiInstance, graph, count) {
    if (count > 0) {
        app.graph.setDirtyCanvas(true, true);
        setTimeout(() => {
            alert(`✅ 成功修复了 ${count} 个模型路径！`);
        }, 100);
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