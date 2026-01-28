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
                padding: 20px; border-radius: 8px; width: 600px; max-width: 90%; max-height: 85vh;
                display: flex; flex-direction: column; color: #ddd; font-family: sans-serif;
            }
            .fixer-dialog h3 { margin-top: 0; border-bottom: 1px solid #444; padding-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
            .fixer-dialog-content { overflow-y: auto; flex-grow: 1; margin: 10px 0; padding-right: 5px; min-height: 100px; }
            
            .fixer-item { margin-bottom: 15px; padding: 12px; background: #222; border-radius: 5px; border: 1px solid #333; }
            .fixer-item label { display: block; margin-bottom: 8px; color: #ccc; font-size: 0.9em; line-height: 1.4; }
            .fixer-item select { width: 100%; background: #111; color: #fff; border: 1px solid #555; padding: 8px; border-radius: 4px; font-size: 13px; cursor: pointer; }
            
            .fixer-download-box { margin-bottom: 15px; padding: 12px; background: #2e1a1a; border-radius: 5px; border: 1px solid #552222; }
            .fixer-download-title { color: #ff6666; font-weight: bold; margin-bottom: 5px; display: block; font-size: 0.95em; }
            
            .fixer-download-btn { display: inline-block; margin-top: 8px; background: #2a7a3b; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 12px; vertical-align: middle;}
            .fixer-download-btn:hover { background: #369b4b; }

            /* [新增] 复制按钮样式 */
            .fixer-copy-btn {
                display: inline-block; margin-top: 8px; margin-left: 8px;
                background: #444; color: white; padding: 6px 12px;
                border: 1px solid #666; border-radius: 4px; font-size: 12px; cursor: pointer;
                vertical-align: middle;
            }
            .fixer-copy-btn:hover { background: #555; }
            .fixer-copy-btn:active { transform: translateY(1px); }
            
            .fixer-section-title { font-size: 14px; color: #888; margin: 15px 0 8px 0; border-left: 3px solid #0072ff; padding-left: 8px; }

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

    showResultDialog(conflicts, downloads, unknowns, onConfirm) {
        const overlay = document.createElement("div");
        overlay.className = "fixer-dialog-overlay";
        overlay.style.display = "flex";

        const dialog = document.createElement("div");
        dialog.className = "fixer-dialog";
        
        let title = "🔍 扫描结果";
        if (unknowns.length > 0) title = "⚠️ 发现缺失文件";
        if (downloads.length > 0 && unknowns.length === 0) title = "⬇️ 发现缺失模型 (可下载)";
        if (conflicts.length > 0 && downloads.length === 0 && unknowns.length === 0) title = "⚠️ 解决路径冲突";
        if ((downloads.length > 0 || unknowns.length > 0) && conflicts.length > 0) title = "⚠️ 需注意 (冲突 & 缺失)";

        dialog.innerHTML = `
            <h3>${title}</h3>
            <div class="fixer-dialog-content" id="fixer-list"></div>
            <div class="fixer-dialog-footer">
                <button class="fixer-btn-cancel" id="fixer-cancel">关闭</button>
                ${conflicts.length > 0 ? '<button class="fixer-btn-confirm" id="fixer-confirm">确认修复</button>' : ''}
            </div>
        `;

        const listContainer = dialog.querySelector("#fixer-list");

        // 1. 渲染"未知缺失项"
        if (unknowns.length > 0) {
            const unTitle = document.createElement("div");
            unTitle.className = "fixer-section-title";
            unTitle.style.borderLeftColor = "#888"; 
            unTitle.textContent = `未收录模型 (${unknowns.length}) - 无法自动修复，请手动搜索：`;
            listContainer.appendChild(unTitle);

            unknowns.forEach(item => {
                const div = document.createElement("div");
                div.className = "fixer-download-box";
                div.style.borderColor = "#444"; 
                div.style.background = "#222";
                
                const searchKeywords = item.old_value;
                const searchUrl = `https://huggingface.co/search/full-text?q=${encodeURIComponent(searchKeywords)}`;

                div.innerHTML = `
                    <span class="fixer-download-title" style="color:#aaa">❓ 未知模型: ${item.old_value}</span>
                    <div style="font-size:12px; color:#666;">类型: ${item.model_type || item.widget_name}</div>
                    <div style="margin-top:8px; font-size:12px; color:#888;">
                        <a href="${searchUrl}" target="_blank" style="color:#FFD21E; text-decoration:none; font-weight:bold;">
                            🤗 在 Hugging Face 搜索 "${item.old_value}"
                        </a>
                    </div>
                `;
                listContainer.appendChild(div);
            });
        }

        // 2. 渲染下载项 (已增加复制按钮逻辑)
        if (downloads.length > 0) {
            const dlTitle = document.createElement("div");
            dlTitle.className = "fixer-section-title";
            dlTitle.textContent = `缺失模型 (${downloads.length}) - 数据库中存在，请下载：`;
            listContainer.appendChild(dlTitle);

            downloads.forEach(item => {
                const div = document.createElement("div");
                div.className = "fixer-download-box";
                
                // 构建 HTML
                const infoHtml = `
                    <span class="fixer-download-title">MISSING: ${item.old_value}</span>
                    <div style="font-size:12px; color:#aaa;">需放入文件夹: /models/${item.model_type}/</div>
                    <div class="fixer-btn-group" style="margin-top:5px;">
                        <a href="${item.download_url}" target="_blank" class="fixer-download-btn">⬇️ 点击下载文件</a>
                        </div>
                `;
                div.innerHTML = infoHtml;

                // [新增] 动态创建并绑定复制按钮
                const copyBtn = document.createElement("button");
                copyBtn.className = "fixer-copy-btn";
                copyBtn.textContent = "📋 复制链接";
                copyBtn.title = item.download_url;
                
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(item.download_url).then(() => {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = "✅ 已复制";
                        copyBtn.style.background = "#2a7a3b"; // 变成绿色
                        copyBtn.style.borderColor = "#2a7a3b";
                        
                        // 1.5秒后恢复原样
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                            copyBtn.style.background = ""; // 恢复 CSS 定义的默认色
                            copyBtn.style.borderColor = "";
                        }, 1500);
                    }).catch(err => {
                        console.error("复制失败:", err);
                        copyBtn.textContent = "❌ 失败";
                    });
                };

                // 将复制按钮插入到按钮组 div 中
                div.querySelector(".fixer-btn-group").appendChild(copyBtn);
                listContainer.appendChild(div);
            });
        }

        // 3. 渲染冲突项
        if (conflicts.length > 0) {
            const cfTitle = document.createElement("div");
            cfTitle.className = "fixer-section-title";
            cfTitle.textContent = `路径冲突 (${conflicts.length}) - 请选择正确文件：`;
            listContainer.appendChild(cfTitle);

            conflicts.forEach(item => {
                const div = document.createElement("div");
                div.className = "fixer-item";
                let optionsHtml = item.candidates.map(path => `<option value="${path}">${path}</option>`).join("");
                const selectId = `sel-${item.id}-${item.widget_name}`;
                
                div.innerHTML = `
                    <label>
                        目标: <strong style="color:#aaa">${item.old_value}</strong>
                    </label>
                    <select id="${selectId}">${optionsHtml}</select>
                `;
                listContainer.appendChild(div);
            });
        }

        dialog.appendChild(listContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const closeDialog = () => {
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            this.setButtonState(false);
        };

        dialog.querySelector("#fixer-cancel").onclick = closeDialog;

        const confirmBtn = dialog.querySelector("#fixer-confirm");
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                const selectionMap = new Map();
                conflicts.forEach(item => {
                    const selectId = `sel-${item.id}-${item.widget_name}`;
                    const select = document.getElementById(selectId);
                    if (select) {
                        selectionMap.set(`${item.id}-${item.widget_name}`, select.value);
                    }
                });
                closeDialog();
                onConfirm(selectionMap);
            };
        }
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