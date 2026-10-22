export function widgetValues(widget) {
    const values = typeof widget.options?.values === "function" ? widget.options.values() : widget.options?.values;
    return Array.isArray(values) && values.every(value => typeof value === "string") ? values : null;
}

export function isModelWidget(widgetName, nodeType, rules) {
    if (!widgetName || !rules) return false;
    const name = widgetName.toLowerCase();
    const base = name.replace(/_\d+$/, "");
    const type = (nodeType || "").toLowerCase();
    const isSubgraph = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(nodeType);
    const scoped = rules.scoped_widgets[base];
    if (scoped) return isSubgraph || scoped.some(keyword => type.includes(keyword));
    if (rules.generic_widgets.includes(base)) {
        return isSubgraph || Boolean(rules.node_types[type]) || rules.loader_keywords.some(keyword => type.includes(keyword));
    }
    return Object.hasOwn(rules.widget_types, name) || Object.hasOwn(rules.widget_types, base)
        || rules.widget_patterns.some(rule => new RegExp(rule.pattern, "i").test(base));
}

export function collectQueries(graph, rules) {
    const queries = [];
    const snapshot = new Map();
    for (const node of graph._nodes || []) {
        for (const widget of node.widgets || []) {
            if (!isModelWidget(widget.name, node.type, rules)) continue;
            const value = String(widget.value ?? "");
            queries.push({ id: node.id, type: widget.name, node_type: node.type, current_val: value, options: widgetValues(widget) });
            snapshot.set(JSON.stringify([node.id, widget.name]), { node, widget, value });
        }
    }
    return { queries, snapshot };
}

export function extractLinksFromWorkflow(graph) {
    const links = Object.create(null);
    links.uncategorized = Object.create(null);
    for (const node of graph._nodes || []) {
        for (const widget of node.widgets || []) {
            if (typeof widget.value !== "string" || !/https?:\/\//.test(widget.value)) continue;
            let category = "uncategorized";
            for (const line of widget.value.split("\n")) {
                const heading = line.trim().match(/^(?:#{1,6}\s*|\*\*)?([a-zA-Z0-9_\- ]+?)(?:\*\*)?:?$/);
                if (heading) category = heading[1].trim().toLowerCase().replace(/\s+/g, "_");
                for (const match of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
                    links[category] ??= Object.create(null);
                    links[category][match[1].trim()] = match[2];
                }
            }
        }
    }
    return links;
}

async function notifyWidget(graph, node, widget) {
    await widget.callback?.(widget.value, graph, node, {}, {});
    node.onResize?.(node.size);
}

export async function applyFixes(graph, fixes, snapshot) {
    const changes = [];
    const warnings = [];
    for (const fix of fixes) {
        const saved = snapshot.get(JSON.stringify([fix.id, fix.widget_name]));
        if (!saved || graph.getNodeById(fix.id) !== saved.node || !saved.node.widgets?.includes(saved.widget) || String(saved.widget.value ?? "") !== saved.value) {
            warnings.push((fix.old_value || "未选择模型") + "：节点已变化，已跳过");
            continue;
        }
        const options = widgetValues(saved.widget);
        if (options && !options.includes(fix.new_value)) {
            warnings.push(fix.new_value + "：已不在节点的可用选项中");
            continue;
        }
        const change = { id: fix.id, widget_name: fix.widget_name, node: saved.node, widget: saved.widget, old_value: saved.widget.value, new_value: fix.new_value };
        saved.widget.value = fix.new_value;
        changes.push(change);
        try {
            await notifyWidget(graph, saved.node, saved.widget);
        } catch (error) {
            warnings.push(fix.new_value + "：节点刷新失败，" + error.message);
        }
    }
    if (changes.length) graph.setDirtyCanvas?.(true, true);
    return { changes, warnings };
}

export async function undoFixes(graph, changes) {
    const remaining = [];
    const warnings = [];
    let restored = 0;
    for (const change of changes) {
        if (graph.getNodeById(change.id) !== change.node || !change.node.widgets?.includes(change.widget) || change.widget.value !== change.new_value) {
            warnings.push(change.new_value + "：节点已变化，未覆盖你的后续修改");
            remaining.push(change);
            continue;
        }
        change.widget.value = change.old_value;
        restored++;
        try {
            await notifyWidget(graph, change.node, change.widget);
        } catch (error) {
            warnings.push((change.old_value || "未选择模型") + "：节点刷新失败，" + error.message);
        }
    }
    if (restored) graph.setDirtyCanvas?.(true, true);
    return { remaining, warnings, restored };
}
