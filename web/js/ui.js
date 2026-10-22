import { injectCSS } from "./styles.js";
import { showResultDialog } from "./dialog.js";
import { ACTIVE_STATES, fetchTasks, subscribeTasks } from "./utils.js";

function isVisibleEl(element) {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

export class FixerUI {
    constructor(onClickHandler) {
        this.onClickHandler = onClickHandler;
        this.buttonElement = null;
        this._insertedEl = null;
        this.processing = false;
        this.label = null;
        this.downloadCount = 0;
        this.resultState = null;
        this.feedbackTimer = null;
        injectCSS();
        subscribeTasks(tasks => {
            this.downloadCount = tasks.filter(task => ACTIVE_STATES.has(task.status)).length;
            this._renderButtonState();
        });
    }

    setButtonState(processing, label = null) {
        if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
        this.feedbackTimer = null;
        this.processing = processing;
        this.label = label;
        this._renderButtonState();
        if (!processing && label) this.feedbackTimer = setTimeout(() => this.setButtonState(false), 2500);
    }

    _renderButtonState() {
        if (!this.buttonElement) return;
        this.buttonElement.textContent = this.label || (this.processing ? "修复中..." : "🔧 修复路径" + (this.downloadCount ? " | 下载 " + this.downloadCount : ""));
        this.buttonElement.disabled = this.processing;
        this.buttonElement.classList.toggle("fixer-processing", this.processing);
    }

    showResultDialog(state) {
        this.setResult(state);
        showResultDialog(state, this.buttonElement);
    }

    setResult(state) {
        this.resultState = state;
    }

    async showLastResult() {
        if (this.processing) return;
        const state = this.resultState || { conflicts: [], downloads: [], unknowns: [], changes: [], warnings: [], message: "暂无扫描记录。" };
        try {
            await fetchTasks();
        } catch (error) {
            state.warnings.push(error.message);
        }
        this.showResultDialog(state);
    }

    _findVisibleAnchor(app) {
        const menu = document.querySelector(".comfy-menu");
        if (isVisibleEl(menu) && isVisibleEl(app.ui?.menuContainer)) return { kind: "legacy", anchor: app.ui.menuContainer };
        const settings = app.menu?.settingsGroup?.element;
        if (settings?.parentElement) return { kind: "settingsGroup", anchor: settings };
        const right = document.querySelector(".workflow-tabs-container .ml-auto");
        if (isVisibleEl(right)) return { kind: "topRight", anchor: right };
        const top = document.querySelector(".workflow-tabs-container");
        return isVisibleEl(top) ? { kind: "topBar", anchor: top } : null;
    }

    _insertButton(app) {
        const hit = this._findVisibleAnchor(app);
        if (!hit) return false;
        if (!this.buttonElement) {
            this.buttonElement = document.createElement("button");
            this.buttonElement.id = "path-fixer-button";
            this.buttonElement.type = "button";
            this.buttonElement.className = "fixer-toolbar-button";
            this.buttonElement.title = "点击扫描修复；右键查看最近结果、撤销修复和管理下载任务";
            this.buttonElement.addEventListener("click", () => this.onClickHandler(this));
            this.buttonElement.addEventListener("contextmenu", event => {
                event.preventDefault();
                this.showLastResult();
            });
            this._insertedEl = document.createElement("div");
            this._insertedEl.className = "fixer-toolbar-group";
            this._insertedEl.appendChild(this.buttonElement);
            this._renderButtonState();
        }
        const root = this._insertedEl;
        root.classList.toggle("fixer-legacy-group", hit.kind === "legacy");
        if (hit.kind === "settingsGroup") {
            if (root.parentElement !== hit.anchor.parentElement) hit.anchor.before(root);
        } else if (root.parentElement !== hit.anchor) {
            if (hit.kind === "topRight") hit.anchor.prepend(root);
            else hit.anchor.appendChild(root);
        }
        return true;
    }

    addPanelButtons(app) {
        this._insertButton(app);
        this._startWatchdog(app);
    }

    _startWatchdog(app) {
        if (this._watchdog) clearInterval(this._watchdog);
        this._watchdog = setInterval(() => this._insertButton(app), 2000);
    }
}
