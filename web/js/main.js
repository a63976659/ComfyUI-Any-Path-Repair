import { app } from "../../../scripts/app.js";
import { fetchFixPaths, fetchModelRules, fetchTasks } from "./utils.js";
import { applyFixes, collectQueries, extractLinksFromWorkflow, undoFixes } from "./workflow.js";
import { FixerUI } from "./ui.js";

let busy = false;
let lastRepair = null;

async function executePathFix(ui) {
    if (busy) return;
    busy = true;
    ui.setButtonState(true, "扫描中...");
    const graph = app.graph;
    let completionLabel = null;
    try {
        const [rules] = await Promise.all([fetchModelRules(), fetchTasks(), app.reloadNodeDefs()]);
        const { queries, snapshot } = collectQueries(graph, rules);
        const results = queries.length ? await fetchFixPaths(queries, extractLinksFromWorkflow(graph)) : [];
        const conflicts = results.filter(item => item.candidates.length > 1);
        const downloads = results.filter(item => !item.candidates.length && item.download_url);
        const unknowns = results.filter(item => !item.candidates.length && !item.download_url);
        const autoFixes = results.filter(item => item.candidates.length === 1).map(item => ({ ...item, new_value: item.candidates[0] }));
        const applied = await applyFixes(graph, autoFixes, snapshot);
        let sessionStarted = applied.changes.length > 0;
        if (applied.changes.length) lastRepair = { graph, changes: applied.changes };
        const state = {
            conflicts, downloads, unknowns,
            changes: lastRepair?.graph === graph ? lastRepair.changes : [],
            warnings: applied.warnings,
            message: queries.length ? (results.length ? "" : "本次扫描未发现需要修复的模型路径。") : "当前工作流中未发现可修复的模型节点。",
            onConfirm: async selection => {
                if (busy) return;
                busy = true;
                ui.setButtonState(true);
                try {
                    const fixes = state.conflicts.filter(item => selection.has(JSON.stringify([item.id, item.widget_name])))
                        .map(item => ({ ...item, new_value: selection.get(JSON.stringify([item.id, item.widget_name])) }));
                    const result = await applyFixes(graph, fixes, snapshot);
                    if (result.changes.length) {
                        if (!sessionStarted) lastRepair = { graph, changes: [] };
                        sessionStarted = true;
                        lastRepair.changes.push(...result.changes);
                    }
                    state.changes = lastRepair?.graph === graph ? lastRepair.changes : [];
                    state.warnings.push(...result.warnings);
                    state.conflicts = state.conflicts.filter(item => !selection.has(JSON.stringify([item.id, item.widget_name])));
                } finally {
                    busy = false;
                    ui.setButtonState(false);
                }
            },
            onUndo: async () => {
                if (busy || lastRepair?.graph !== graph) return;
                busy = true;
                ui.setButtonState(true);
                try {
                    const result = await undoFixes(graph, lastRepair.changes);
                    lastRepair.changes = result.remaining;
                    state.changes = result.remaining;
                    state.warnings.push(...result.warnings);
                    state.message = "已撤销 " + result.restored + " 项路径修改。";
                } finally {
                    busy = false;
                    ui.setButtonState(false);
                }
            }
        };
        ui.setResult(state);
        if (conflicts.length || downloads.length || unknowns.length || applied.warnings.length) {
            ui.showResultDialog(state);
        } else {
            completionLabel = applied.changes.length ? "已修复 " + applied.changes.length + " 项" : queries.length ? "路径正常" : "未发现模型节点";
        }
    } catch (error) {
        console.error("[Path-Fixer]", error);
        ui.showResultDialog({ conflicts: [], downloads: [], unknowns: [], changes: [], warnings: [error.message], message: "扫描未完成，请解决上述问题后重试。" });
    } finally {
        busy = false;
        ui.setButtonState(false, completionLabel);
    }
}

app.registerExtension({
    name: "ComfyUI.ModelPathFixer",
    async setup() {
        const ui = new FixerUI(executePathFix);
        ui.addPanelButtons(app);
    }
});
