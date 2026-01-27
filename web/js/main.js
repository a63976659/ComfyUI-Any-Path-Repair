/**
 * ComfyUI-Model-Path-Fixer 主入口
 */

import { app } from "../../../scripts/app.js";
import { error, log, isModelWidget, fetchFixPaths } from "./utils.js";
import { FixerUI } from "./ui.js";

// 核心逻辑：执行修复
async function executePathFix(uiInstance) {
    const graph = app.graph;
    const queries = [];
    
    // 1. UI 变更为处理中
    uiInstance.setButtonState(true, "扫描中...");
    
    try {
        // 2. 遍历所有节点
        for (const node of graph._nodes) {
            if (!node.widgets) continue;

            for (const widget of node.widgets) {
                // 检查是否是支持的模型加载器且值为字符串
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
            uiInstance.setButtonState(false, "无目标");
            setTimeout(() => uiInstance.setButtonState(false), 2000);
            return;
        }

        // 3. 发送给后端
        uiInstance.setButtonState(true, "修复中...");
        const data = await fetchFixPaths(queries);
        const fixes = data.fixed || [];

        // 4. 应用结果
        if (fixes.length === 0) {
            uiInstance.setButtonState(false, "路径正常");
        } else {
            let logMsg = "已修复以下路径:\n";
            
            for (const fix of fixes) {
                const node = graph.getNodeById(fix.id);
                if (node) {
                    const widget = node.widgets.find(w => w.name === fix.widget_name);
                    if (widget) {
                        widget.value = fix.new_value;
                        // 触发回调以更新节点内部状态
                        if (widget.callback) {
                            widget.callback(widget.value, graph, node, {}, {});
                        }
                        logMsg += `[Node ${fix.id}] ${fix.old_value} -> ${fix.new_value}\n`;
                    }
                }
            }
            
            log(logMsg);
            // 标记画布脏以触发刷新
            app.graph.setDirtyCanvas(true, true);
            
            alert(`✅ 成功修复了 ${fixes.length} 个模型路径！`);
            uiInstance.setButtonState(false, `修复 ${fixes.length} 个`);
        }

    } catch (e) {
        error("执行修复流程出错:", e);
        uiInstance.setButtonState(false, "错误");
        alert("修复过程发生错误，请查看控制台。");
    } finally {
        // 2秒后恢复默认文字
        setTimeout(() => uiInstance.setButtonState(false), 2000);
    }
}

// 注册扩展
app.registerExtension({
    name: "ComfyUI.ModelPathFixer",
    
    async setup(app) {
        // 初始化 UI 实例，传入点击回调
        const ui = new FixerUI(executePathFix);
        
        // 等待一点时间确保 UI 加载完毕 (参考 Translation Node 的做法)
        setTimeout(() => {
            ui.addPanelButtons(app);
        }, 500);
    }
});