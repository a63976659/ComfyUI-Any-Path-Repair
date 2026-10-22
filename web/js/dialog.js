import { ACTIVE_STATES, cancelDownloadFromServer, downloadModelFromServer, subscribeTasks } from "./utils.js";

let closeCurrentDialog = null;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
}

function button(text, handler, primary = false) {
    const node = element("button", "fixer-action" + (primary ? " fixer-primary" : ""), text);
    node.type = "button";
    node.onclick = handler;
    return node;
}

function bytes(value) {
    if (!value) return "0 B";
    const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
    return (value / 1024 ** unit).toFixed(unit ? 1 : 0) + " " + ["B", "KB", "MB", "GB"][unit];
}

function searchLink(item) {
    const link = element("a", "fixer-action", "搜索模型");
    const term = (item.old_value || item.widget_name || "").split(/[\\/]/).pop();
    link.href = "https://huggingface.co/models?search=" + encodeURIComponent(term);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
}

export function showResultDialog(state, returnFocus) {
    closeCurrentDialog?.();
    const previousFocus = returnFocus;
    const overlay = element("div", "fixer-dialog-overlay");
    const dialog = element("section", "fixer-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "path-fixer-dialog-title");
    dialog.tabIndex = -1;
    const title = element("h2", "", "模型路径与下载");
    title.id = "path-fixer-dialog-title";
    const notice = element("p", "fixer-muted", "关闭面板或刷新页面不影响下载；退出 ComfyUI 会停止任务。");
    const content = element("div", "fixer-dialog-content");
    const repairContent = element("div");
    const missingContent = element("div");
    const tasksContent = element("div");
    const taskTitle = element("h3", "", "下载任务");
    const taskEmpty = element("p", "fixer-muted", "暂无下载任务。");
    tasksContent.append(taskTitle, taskEmpty);
    content.append(repairContent, missingContent, tasksContent);
    const footer = element("div", "fixer-dialog-footer");
    const undo = button("撤销最近一次修复", async () => {
        undo.disabled = confirm.disabled = true;
        try { await state.onUndo(); } catch (error) { state.warnings.push(error.message); }
        renderRepair();
    });
    const confirm = button("应用所选路径", async () => {
        const selection = new Map();
        for (const [key, select] of selections) if (select.value) selection.set(key, select.value);
        if (!selection.size) {
            state.warnings.push("请先选择需要修复的路径。");
            renderRepair();
            return;
        }
        undo.disabled = confirm.disabled = true;
        try { await state.onConfirm(selection); } catch (error) { state.warnings.push(error.message); }
        renderRepair();
    }, true);
    let unsubscribe = () => {};
    const close = () => {
        unsubscribe();
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        if (closeCurrentDialog === close) closeCurrentDialog = null;
        if (previousFocus?.isConnected) previousFocus.focus();
    };
    const closeButton = button("关闭", close);
    footer.append(undo, confirm, closeButton);
    dialog.append(title, notice, content, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    closeCurrentDialog = close;
    const selections = new Map();
    const taskRows = new Map();
    const missingRows = [];

    function renderRepair() {
        repairContent.replaceChildren();
        selections.clear();
        if (state.message) repairContent.appendChild(element("p", "fixer-muted", state.message));
        for (const warning of state.warnings) repairContent.appendChild(element("p", "fixer-warning", warning));
        if (state.changes.length) {
            repairContent.appendChild(element("h3", "", "最近修复：" + state.changes.length));
            for (const change of state.changes) {
                const row = element("div", "fixer-item");
                row.append(
                    element("strong", "", change.widget_name),
                    element("div", "fixer-old-path", "原路径：" + (change.old_value ?? "未选择")),
                    element("div", "fixer-new-path", "新路径：" + change.new_value)
                );
                repairContent.appendChild(row);
            }
        }
        if (state.conflicts.length) {
            repairContent.appendChild(element("h3", "", "请选择同名模型：" + state.conflicts.length));
            for (const item of state.conflicts) {
                const row = element("label", "fixer-item");
                const select = element("select", "fixer-select");
                select.setAttribute("aria-label", "选择 " + item.old_value + " 的正确路径");
                const placeholder = element("option", "", "请选择正确版本");
                placeholder.value = "";
                placeholder.disabled = true;
                placeholder.selected = true;
                select.appendChild(placeholder);
                for (const path of item.candidates) {
                    const option = element("option", "", path);
                    option.value = path;
                    select.appendChild(option);
                }
                selections.set(JSON.stringify([item.id, item.widget_name]), select);
                row.append(element("strong", "", item.old_value), select);
                repairContent.appendChild(row);
            }
        }
        undo.hidden = !state.onUndo || !state.changes.length;
        undo.disabled = false;
        confirm.hidden = !state.onConfirm || !state.conflicts.length;
        confirm.disabled = false;
    }

    async function startMissing(row, item) {
        row.pending = true;
        row.action.disabled = true;
        row.error.textContent = "";
        try {
            const task = await downloadModelFromServer(item);
            row.taskId = task.id;
        } catch (error) {
            row.error.textContent = error.message;
        } finally {
            row.pending = false;
            renderMissing(row, row.task);
        }
    }

    function renderMissing(row, task) {
        row.task = task;
        if (task) row.target.textContent = "保存位置：" + task.path;
        const active = task && ACTIVE_STATES.has(task.status);
        row.action.textContent = active ? "任务进行中" : task?.status === "completed" ? "已下载，请重新扫描" : task ? "重新下载" : "下载";
        row.action.disabled = row.pending || active || task?.status === "completed";
    }

    if (state.downloads.length) missingContent.appendChild(element("h3", "", "缺失模型：" + state.downloads.length));
    for (const item of state.downloads) {
        const box = element("div", "fixer-item");
        const target = element("p", "fixer-muted", "目标目录：" + [item.model_type || "未知", item.subfolder].filter(Boolean).join("/"));
        const error = element("p", "fixer-warning");
        const row = { item, target, error, pending: false, task: null, taskId: null };
        row.action = button("下载", () => startMissing(row, item), true);
        const copy = button("复制链接", async () => {
            try {
                await navigator.clipboard.writeText(item.download_url);
                copy.textContent = "已复制";
            } catch {
                window.prompt("请复制下载链接", item.download_url);
            }
        });
        const actions = element("div", "fixer-actions");
        actions.append(row.action, copy);
        box.append(element("strong", "", item.old_value), target, actions, error);
        missingContent.appendChild(box);
        missingRows.push(row);
    }
    if (state.unknowns.length) missingContent.appendChild(element("h3", "", "未找到下载链接：" + state.unknowns.length));
    for (const item of state.unknowns) {
        const box = element("div", "fixer-item");
        box.append(element("strong", "", item.old_value || "节点未选择模型"), searchLink(item));
        missingContent.appendChild(box);
    }

    function renderTasks(tasks) {
        taskEmpty.hidden = tasks.length > 0;
        taskTitle.textContent = "下载任务：" + tasks.length;
        const ids = new Set(tasks.map(task => task.id));
        for (const [id, row] of taskRows) if (!ids.has(id)) { row.box.remove(); taskRows.delete(id); }
        for (const task of tasks) {
            let row = taskRows.get(task.id);
            if (!row) {
                row = { box: element("div", "fixer-item"), title: element("strong"), target: element("p", "fixer-muted"), status: element("p", "fixer-muted"), progress: element("progress", "fixer-progress"), error: element("p", "fixer-warning"), pending: false };
                row.action = button("", null);
                row.progress.max = 1;
                row.box.append(row.title, row.target, row.status, row.progress, row.action, row.error);
                taskRows.set(task.id, row);
                tasksContent.appendChild(row.box);
            }
            row.title.textContent = task.filename;
            row.currentTask = task;
            row.target.textContent = "保存位置：" + task.path;
            const labels = { queued: "排队中", downloading: "下载中", cancelling: "正在取消", completed: "已完成，请重新扫描模型路径", failed: "下载失败", cancelled: "已取消" };
            row.status.textContent = (labels[task.status] || task.status) + "：" + bytes(task.current) + (task.total ? " / " + bytes(task.total) : "");
            row.progress.hidden = !ACTIVE_STATES.has(task.status);
            if (task.total) row.progress.value = Math.min(task.current / task.total, 1);
            else row.progress.removeAttribute("value");
            row.error.textContent = task.error || row.operationError || "";
            row.action.textContent = ACTIVE_STATES.has(task.status) ? "取消下载" : task.status === "completed" ? "已完成" : "重试";
            row.action.disabled = row.pending || task.status === "completed" || task.status === "cancelling";
            row.action.onclick = async () => {
                row.pending = true;
                row.action.disabled = true;
                row.operationError = "";
                try {
                    if (ACTIVE_STATES.has(task.status)) await cancelDownloadFromServer(task.id);
                    else await downloadModelFromServer(task);
                } catch (error) {
                    row.operationError = error.message;
                    row.error.textContent = error.message;
                } finally {
                    row.pending = false;
                    row.action.disabled = row.currentTask.status === "completed" || row.currentTask.status === "cancelling";
                }
            };
        }
        for (const row of missingRows) {
            const filename = row.item.old_value.split(/[\\/]/).pop();
            const matching = tasks.filter(task => task.id === row.taskId || (task.filename === filename && task.model_type === row.item.model_type && task.subfolder === (row.item.subfolder || "")));
            renderMissing(row, matching.at(-1));
        }
    }

    function onKeyDown(event) {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") {
            const focusable = [...dialog.querySelectorAll("button, a, select")].filter(node => !node.disabled && !node.hidden && node.getClientRects().length);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first) { event.preventDefault(); dialog.focus(); }
            else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
        }
    }
    renderRepair();
    unsubscribe = subscribeTasks(renderTasks);
    document.addEventListener("keydown", onKeyDown);
    dialog.focus();
}
