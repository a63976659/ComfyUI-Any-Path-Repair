import { api } from "../../../scripts/api.js";
import { injectCSS } from "./styles.js";
import { showResultDialog } from "./dialog.js";

// 判断元素及其父容器是否真实可见（排除 display:none 的隐藏容器；
// 新版 ComfyUI 中 .comfy-menu/menuContainer 仍存在但被隐藏，必须检测可见性）
function isVisibleEl(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const pr = el.parentElement?.getBoundingClientRect();
    return !!pr && pr.width > 0 && pr.height > 0;
}

export class FixerUI {
    
    constructor(onClickHandler) {
        this.onClickHandler = onClickHandler;
        this.buttonElement = null;
        injectCSS(); 
        this.setupStatusListener();
    }

    setButtonState(isProcessing, text = null) {
        if (!this.buttonElement) return;
        const label = text || (isProcessing ? "修复中..." : "🔧 修复模型路径");
        
        if (this.buttonElement.setLabel) this.buttonElement.setLabel(label);
        else this.buttonElement.innerText = label;

        const el = this.buttonElement.element || this.buttonElement;
        if (isProcessing) el.classList.add("fixer-processing");
        else el.classList.remove("fixer-processing");
    }

    showResultDialog(conflicts, downloads, unknowns, onConfirm) {
        showResultDialog(this, conflicts, downloads, unknowns, onConfirm);
    }

    setupStatusListener() {
        api.addEventListener("model_fixer_download_status", (event) => {
            const data = event.detail;
            const safeName = data.filename.replace(/[^\w\-\.]/g, '_');
            const btn = document.getElementById(`btn-dl-${safeName}`);

            if (data.success) {
                if (btn) {
                    btn.textContent = "✅ 已完成 (请刷新)";
                    btn.style.background = "#2a7a3b";
                    btn.onclick = null;
                }
                alert(`✅ 下载完成！\n文件: ${data.filename}\n请刷新 ComfyUI 以加载模型。`);
            } else {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "❌ 失败/重试";
                    btn.style.background = "#a00"; 
                }
                if (data.error !== "用户中断") {
                    alert(`❌ 下载失败: ${data.filename}\n原因: ${data.error}`);
                }
            }
        });

        api.addEventListener("model_fixer_download_progress", (event) => {
            const data = event.detail; 
            const safeName = data.filename.replace(/[^\w\-\.]/g, '_');
            const btn = document.getElementById(`btn-dl-${safeName}`);
            
            if (btn) {
                let pct = 0;
                if (data.total > 0) pct = Math.round((data.current / data.total) * 100);
                btn.textContent = `❌ 中断 (${pct}%)`;
                btn.style.background = "#d32f2f";
                btn.disabled = false;
            }
        });
    }

    // 查找可见的插入锚点：旧版可见菜单 → settingsGroup → 新版 Vue 顶栏右侧按钮区 → 顶栏容器
    // 返回 { kind, anchor }；找不到返回 null（锚点可能尚未就绪，由调用方轮询重试）
    _findVisibleAnchor(app) {
        const comfyMenu = document.querySelector(".comfy-menu");
        if (comfyMenu && isVisibleEl(comfyMenu) && app.ui?.menuContainer && isVisibleEl(app.ui.menuContainer)) {
            return { kind: "legacy", anchor: app.ui.menuContainer };
        }
        const settingsGroupEl = app.menu?.settingsGroup?.element;
        if (settingsGroupEl && isVisibleEl(settingsGroupEl)) {
            return { kind: "settingsGroup", anchor: settingsGroupEl };
        }
        const topRight = document.querySelector(".workflow-tabs-container .ml-auto");
        if (topRight && isVisibleEl(topRight)) {
            return { kind: "topRight", anchor: topRight };
        }
        const topBar = document.querySelector(".workflow-tabs-container");
        if (topBar && isVisibleEl(topBar)) {
            return { kind: "topBar", anchor: topBar };
        }
        return null;
    }

    // 把按钮挂到找到的可见锚点；成功返回 true（幂等：已挂载则直接成功）
    _insertButton(app) {
        if (this.buttonElement && this.buttonElement.isConnected) return true;
        const hit = this._findVisibleAnchor(app);
        if (!hit) return false;

        let el;           // 实际插入 DOM 的节点
        let labelTarget;  // setButtonState 的更新目标（带文字/setLabel 的节点）
        if (hit.kind === "legacy") {
            // 旧版 UI：左侧菜单 .comfy-menu，原生按钮即可
            el = document.createElement("button");
            el.id = "fixer-legacy-btn";
            el.className = "fixer-btn-legacy-ui";
            el.textContent = "🔧 修复路径";
            el.title = "扫描并修复丢失引用的模型路径";
            el.addEventListener("click", async () => await this.onClickHandler(this));
            labelTarget = el;
            hit.anchor.appendChild(el);
        } else {
            // 新版 UI：优先 ComfyButton（融入原生样式），API 缺失时降级原生按钮
            if (window?.comfyAPI?.button?.ComfyButton && window?.comfyAPI?.buttonGroup?.ComfyButtonGroup) {
                const ComfyButton = window.comfyAPI.button.ComfyButton;
                const ComfyButtonGroup = window.comfyAPI.buttonGroup.ComfyButtonGroup;
                const btn = new ComfyButton({
                    action: async () => await this.onClickHandler(this),
                    tooltip: "扫描并修复丢失引用的模型路径",
                    content: "🔧 修复路径",
                    classList: "fixer-btn-new-ui"
                });
                btn.element.setLabel = (txt) => {
                    if (btn.element.firstChild) btn.element.firstChild.textContent = txt;
                    else btn.element.innerText = txt;
                };
                el = new ComfyButtonGroup(btn.element).element;
                labelTarget = btn.element;
            } else {
                el = document.createElement("button");
                el.id = "fixer-legacy-btn";
                el.className = "fixer-btn-legacy-ui";
                el.textContent = "🔧 修复路径";
                el.title = "扫描并修复丢失引用的模型路径";
                el.addEventListener("click", async () => await this.onClickHandler(this));
                labelTarget = el;
            }
            if (hit.kind === "settingsGroup") hit.anchor.before(el);
            else if (hit.kind === "topRight") hit.anchor.prepend(el);
            else hit.anchor.appendChild(el);
        }

        this.buttonElement = labelTarget;
        this._insertedEl = el; // 看门狗移除时以插入节点为准（含 ComfyButtonGroup 包裹层）
        return true;
    }

    addPanelButtons(app) {
        if (this._insertButton(app)) {
            this._startWatchdog(app);
            return;
        }
        // 锚点可能尚未就绪，轮询重试（最多 30 秒）
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            if (this._insertButton(app)) {
                clearInterval(timer);
                this._startWatchdog(app);
            } else if (tries >= 60) {
                clearInterval(timer);
                console.error("[Path-Fixer] 未找到可用的菜单锚点，修复按钮未插入");
            }
        }, 500);
    }

    // 低频看门狗：按钮被顶栏重渲染移除、或所在容器变为不可见时自动重新插入
    _startWatchdog(app) {
        if (this._watchdog) clearInterval(this._watchdog);
        this._watchdog = setInterval(() => {
            if (!this.buttonElement || !this.buttonElement.isConnected || !isVisibleEl(this.buttonElement)) {
                (this._insertedEl || this.buttonElement)?.remove?.();
                this.buttonElement = null;
                this._insertedEl = null;
                this._insertButton(app);
            }
        }, 2000);
    }
}