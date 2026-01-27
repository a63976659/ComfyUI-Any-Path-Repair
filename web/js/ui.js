import { $el } from "../../../scripts/ui.js";
import { error } from "./utils.js";

export class FixerUI {
    
    constructor(onClickHandler) {
        this.onClickHandler = onClickHandler;
        this.buttonElement = null;
        this.injectCSS();
    }

    injectCSS() {
        if (document.getElementById("path-fixer-style")) return;

        const styleElem = document.createElement('style');
        styleElem.id = "path-fixer-style";
        styleElem.textContent = `
            @keyframes fixerFlowEffect {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            .fixer-btn-processing {
                background: linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff);
                background-size: 200% 100%;
                color: white !important;
                border: none;
                animation: fixerFlowEffect 2s ease infinite;
                cursor: wait !important;
            }
            .fixer-btn-idle {
                background: linear-gradient(90deg, #383838, #4a4a4a);
                color: #e0e0e0;
                border: 1px solid rgba(255,255,255,0.1);
                transition: all 0.3s ease;
            }
            .fixer-btn-idle:hover {
                background: #5a5a5a;
                transform: translateY(-1px);
            }
            .fixer-btn {
                cursor: pointer;
                border-radius: 4px;
                padding: 4px 10px;
                font-size: 12px;
                font-weight: bold;
            }
            .fixer-dialog-overlay {
                display: none;
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); z-index: 9999;
                justify-content: center; align-items: center;
            }
            .fixer-dialog {
                background: #2b2b2b; border: 1px solid #444; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                padding: 20px; border-radius: 8px; width: 550px; max-width: 90%; max-height: 85vh;
                display: flex; flex-direction: column; color: #ddd; font-family: sans-serif;
            }
            .fixer-dialog h3 { margin-top: 0; border-bottom: 1px solid #444; padding-bottom: 10px; }
            .fixer-dialog-content { overflow-y: auto; flex-grow: 1; margin: 10px 0; padding-right: 5px; min-height: 100px; }
            .fixer-item { margin-bottom: 15px; padding: 12px; background: #222; border-radius: 5px; border: 1px solid #333; }
            .fixer-item label { display: block; margin-bottom: 8px; color: #ccc; font-size: 0.9em; line-height: 1.4; }
            .fixer-item select { width: 100%; background: #111; color: #fff; border: 1px solid #555; padding: 8px; border-radius: 4px; font-size: 13px; cursor: pointer; }
            .fixer-dialog-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; border-top: 1px solid #333; padding-top: 15px; }
            .fixer-btn-confirm { background: #0072ff; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            .fixer-btn-cancel { background: #555; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        `;
        document.head.appendChild(styleElem);
    }

    setButtonState(isProcessing, text = null) {
        if (!this.buttonElement) return;
        this.buttonElement.classList.remove("fixer-btn-processing", "fixer-btn-idle");
        if (isProcessing) {
            this.buttonElement.classList.add("fixer-btn-processing");
        } else {
            this.buttonElement.classList.add("fixer-btn-idle");
        }
        const label = text || (isProcessing ? "修复中..." : "🔧 修复模型路径");
        if (this.buttonElement.setLabel) this.buttonElement.setLabel(label);
        else this.buttonElement.textContent = label;
    }

    showConflictDialog(conflicts, onConfirm) {
        const overlay = document.createElement("div");
        overlay.className = "fixer-dialog-overlay";
        overlay.style.display = "flex";

        const dialog = document.createElement("div");
        dialog.className = "fixer-dialog";
        
        dialog.innerHTML = `
            <h3>⚠️ 发现多个同名文件</h3>
            <div style="font-size:12px; color:#888; margin-bottom:10px;">请为以下节点选择正确的文件路径：</div>
            <div class="fixer-dialog-content" id="fixer-list"></div>
            <div class="fixer-dialog-footer">
                <button class="fixer-btn-cancel" id="fixer-cancel">取消</button>
                <button class="fixer-btn-confirm" id="fixer-confirm">确认修复</button>
            </div>
        `;

        const listContainer = dialog.querySelector("#fixer-list");
        const selectionMap = new Map();

        conflicts.forEach(item => {
            const div = document.createElement("div");
            div.className = "fixer-item";
            let optionsHtml = item.candidates.map(path => `<option value="${path}">${path}</option>`).join("");
            
            // 修复 ID 冲突问题
            const selectId = `sel-${item.id}-${item.widget_name}`;
            
            div.innerHTML = `
                <label>
                    <span style="color:#aaa;">节点 ${item.id} (${item.widget_name})</span><br/>
                    目标: <strong style="color:#ff6666">${item.old_value}</strong>
                </label>
                <select id="${selectId}">${optionsHtml}</select>
            `;
            listContainer.appendChild(div);
        });

        dialog.appendChild(listContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const closeDialog = () => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            this.setButtonState(false);
        };

        dialog.querySelector("#fixer-cancel").onclick = closeDialog;

        dialog.querySelector("#fixer-confirm").onclick = () => {
            conflicts.forEach(item => {
                const selectId = `sel-${item.id}-${item.widget_name}`;
                // 使用 getElementById 获取最稳妥，防止选择器语法错误
                const select = document.getElementById(selectId);
                if (select) {
                    selectionMap.set(`${item.id}-${item.widget_name}`, select.value);
                }
            });
            closeDialog();
            onConfirm(selectionMap);
        };
    }

    addPanelButtons(app) {
        if (window?.comfyAPI?.button?.ComfyButton && window?.comfyAPI?.buttonGroup?.ComfyButtonGroup) {
            this.addButtonsToNewUI(app);
        } else {
            this.addButtonsToOldUI(app);
        }
    }

    addButtonsToOldUI(app) {
        if (document.getElementById("path-fixer-button")) return;
        const menu = document.querySelector(".comfy-menu");
        if (!menu) return;
        const btn = $el("button.fixer-btn.fixer-btn-idle", {
            id: "path-fixer-button",
            textContent: "🔧 修复模型路径",
            title: "扫描并修复丢失引用的模型路径",
            style: { marginBottom: "4px" },
            onclick: async () => await this.onClickHandler(this),
        });
        this.buttonElement = btn;
        const refreshBtn = document.getElementById("comfy-refresh-button");
        refreshBtn ? menu.insertBefore(btn, refreshBtn) : menu.appendChild(btn);
    }

    addButtonsToNewUI(app) {
        const ComfyButtonGroup = window.comfyAPI.buttonGroup.ComfyButtonGroup;
        const ComfyButton = window.comfyAPI.button.ComfyButton;
        const btn = new ComfyButton({
            action: async () => await this.onClickHandler(this),
            tooltip: "扫描并修复丢失引用的模型路径",
            content: "🔧 修复路径",
            classList: "fixer-btn fixer-btn-idle"
        });
        this.buttonElement = btn.element;
        this.buttonElement.setLabel = (txt) => { 
            if(btn.element.firstChild) btn.element.firstChild.textContent = txt;
            else btn.element.innerText = txt;
        };
        const group = new ComfyButtonGroup(btn.element);
        if (app.menu?.settingsGroup?.element) {
            app.menu.settingsGroup.element.before(group.element);
        } else {
            this.addButtonsToOldUI(app);
        }
    }
}