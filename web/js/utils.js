import { api } from "../../../scripts/api.js";

const tasks = new Map();
const taskListeners = new Set();
export const ACTIVE_STATES = new Set(["queued", "downloading", "cancelling"]);

export async function requestJSON(path, body) {
    let response;
    try {
        response = await api.fetchApi("/model_path_fixer/" + path, body === undefined ? {} : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    } catch (error) {
        throw new Error("无法连接 ComfyUI：" + error.message);
    }
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("服务器返回了无效数据（" + response.status + "）");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("服务器返回了无效数据");
    if (!response.ok || data.error || data.success === false) {
        throw new Error(data.error || data.message || "请求失败（" + response.status + "）");
    }
    return data;
}

export async function fetchModelRules() {
    const rules = await requestJSON("config");
    if (!rules.widget_types || !rules.node_types || !rules.scoped_widgets || !Array.isArray(rules.generic_widgets) || !Array.isArray(rules.loader_keywords) || !Array.isArray(rules.widget_patterns)) {
        throw new Error("模型识别配置无效，请更新插件并重启 ComfyUI");
    }
    return rules;
}

export async function fetchFixPaths(queries, dynamicLinks) {
    const data = await requestJSON("fix", { queries, dynamic_links: dynamicLinks });
    if (!Array.isArray(data.fixed)) throw new Error("服务器返回的扫描结果无效");
    return data.fixed;
}

export function updateTask(task) {
    if (!task || typeof task.id !== "string") return;
    const previous = tasks.get(task.id);
    if (previous && previous.revision > task.revision) return;
    tasks.set(task.id, task);
    const finished = [...tasks.values()].filter(item => !ACTIVE_STATES.has(item.status)).sort((a, b) => a.updated_at - b.updated_at);
    for (const old of finished.slice(0, -128)) tasks.delete(old.id);
    for (const listener of taskListeners) listener([...tasks.values()]);
}

api.addEventListener("model_fixer_task", event => updateTask(event.detail));

export function subscribeTasks(listener) {
    taskListeners.add(listener);
    listener([...tasks.values()]);
    return () => taskListeners.delete(listener);
}

export async function fetchTasks() {
    const data = await requestJSON("active_tasks");
    if (!Array.isArray(data.tasks)) throw new Error("服务器返回的下载任务无效");
    for (const task of data.tasks) updateTask(task);
    return [...tasks.values()];
}

export async function downloadModelFromServer(item) {
    const filename = item.filename || item.old_value?.split(/[\\/]/).pop();
    const data = await requestJSON("download", {
        url: item.download_url || item.url,
        filename,
        model_type: item.model_type,
        subfolder: item.subfolder || ""
    });
    updateTask(data.task);
    return data.task;
}

export async function cancelDownloadFromServer(taskId) {
    const data = await requestJSON("cancel", { task_id: taskId });
    updateTask(data.task);
    return data.task;
}
