import { api } from "../../../scripts/api.js";
import { injectCSS } from "./styles.js";
import { showResultDialog } from "./dialog.js";

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

    addPanelButtons(app) {
        if (window?.comfyAPI?.button?.ComfyButton && window?.comfyAPI?.buttonGroup?.ComfyButtonGroup) {
            const ComfyButtonGroup = window.comfyAPI.buttonGroup.ComfyButtonGroup;
            const ComfyButton = window.comfyAPI.button.ComfyButton;
            const btn = new ComfyButton({
                action: async () => await this.onClickHandler(this),
                tooltip: "扫描并修复丢失引用的模型路径",
                content: "🔧 修复路径",
                classList: "fixer-btn-new-ui" 
            });
            this.buttonElement = btn.element;
            this.buttonElement.setLabel = (txt) => {
                if(btn.element.firstChild) btn.element.firstChild.textContent = txt;
                else btn.element.innerText = txt;
            };
            const group = new ComfyButtonGroup(btn.element);
            if (app.menu?.settingsGroup?.element) {
                app.menu.settingsGroup.element.before(group.element);
            }
        }
    }
}