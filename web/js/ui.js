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
        this.resultRequest = 0;
        this.feedbackTimer = null;
        injectCSS();
        subscribeTasks(tasks => {
            const count = tasks.filter(task => ACTIVE_STATES.has(task.status)).length;
            if (count === this.downloadCount) return;
            this.downloadCount = count;
            this._renderButtonState();
        });
    }

    setButtonState(processing, label = null) {
        if (processing) this.resultRequest++;
        if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
        this.feedbackTimer = null;
        this.processing = processing;
        this.label = label;
        this._renderButtonState();
        if (!processing && label) this.feedbackTimer = setTimeout(() => this.setButtonState(false), 2500);
    }

    _renderButtonState() {
        if (!this.buttonElement) return;
        const label = this.label || (this.processing ? "修复中..." : "修复路径");
        const downloadStatus = this.downloadCount ? `${this.downloadCount} 个下载任务进行中` : "";
        this.buttonLabel.textContent = label;
        this.downloadBadge.hidden = !this.downloadCount;
        this.downloadBadge.title = downloadStatus;
        this.downloadCountElement.textContent = this.downloadCount;
        this.buttonElement.setAttribute("aria-label", downloadStatus ? `${label}，${downloadStatus}` : label);
        this.buttonElement.disabled = this.processing;
        this.buttonElement.classList.toggle("fixer-processing", this.processing);
    }

    showResultDialog(state) {
        this.setResult(state);
        showResultDialog(state, this.buttonElement);
    }

    setResult(state) {
        this.resultRequest++;
        this.resultState = state;
    }

    async showLastResult() {
        if (this.processing) return;
        const request = ++this.resultRequest;
        let warning = null;
        try {
            await fetchTasks();
        } catch (error) {
            warning = error.message;
        }
        if (this.processing || request !== this.resultRequest) return;
        const state = this.resultState || { conflicts: [], downloads: [], unknowns: [], changes: [], warnings: [], message: "暂无扫描记录。" };
        if (warning && !state.warnings.includes(warning)) state.warnings.push(warning);
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
            this.buttonElement.innerHTML = `
                <svg class="fixer-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path class="fixer-toolbar-wrench" d="M21 5.5l-4 4-3-3 4-4a6.5 6.5 0 0 0-8.1 8.2l-6.2 6.2a2.5 2.5 0 0 0 3.5 3.5l6.2-6.2A6.5 6.5 0 0 0 21 5.5Z"/>
                    <path class="fixer-toolbar-spinner" d="M21 12a9 9 0 1 1-9-9"/>
                </svg>
                <span class="fixer-toolbar-label"></span>
                <span class="fixer-download-badge" aria-hidden="true" hidden>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round" focusable="false">
                        <path d="M6 1.5v5.75m-2.5-2.5L6 7.25l2.5-2.5M2 10h8"/>
                    </svg>
                    <span class="fixer-download-count"></span>
                </span>
            `;
            this.buttonLabel = this.buttonElement.querySelector(".fixer-toolbar-label");
            this.downloadBadge = this.buttonElement.querySelector(".fixer-download-badge");
            this.downloadCountElement = this.downloadBadge.querySelector(".fixer-download-count");
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
        fetchTasks().catch(error => console.warn("[Path-Fixer] 无法恢复下载任务：", error));
    }

    _startWatchdog(app) {
        if (this._watchdog) clearInterval(this._watchdog);
        this._watchdog = setInterval(() => this._insertButton(app), 2000);
    }
}
