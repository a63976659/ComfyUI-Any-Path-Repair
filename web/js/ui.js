import { api } from "../../../scripts/api.js";
import { downloadModelFromServer, fetchActiveDownloads, cancelDownloadFromServer } from "./utils.js"; // 引入cancelDownloadFromServer

export class FixerUI {
    
    constructor(onClickHandler) {
        this.onClickHandler = onClickHandler;
        this.buttonElement = null;
        this.injectCSS();
        this.setupStatusListener();
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
                    btn.onclick = null; // 禁止点击
                }
                alert(`✅ 下载完成！\n文件: ${data.filename}\n请刷新 ComfyUI 以加载模型。`);
            } else {
                // 如果是中断或失败，按钮恢复可点击状态（重新下载）
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "❌ 失败/重试";
                    btn.style.background = "#a00"; 
                    // 重新绑定下载事件 (因为中断把 onclick 覆盖了)
                    // 但这里简单处理：用户关闭弹窗重新点修复即可
                }
                if (data.error !== "用户中断") {
                    alert(`❌ 下载失败: ${data.filename}\n原因: ${data.error}`);
                }
            }
        });

        // 依然监听进度，主要用于更新 UI 视觉，但不再是核心反馈来源(核心改为控制台)
        api.addEventListener("model_fixer_download_progress", (event) => {
            const data = event.detail; 
            const safeName = data.filename.replace(/[^\w\-\.]/g, '_');
            const btn = document.getElementById(`btn-dl-${safeName}`);
            
            if (btn) {
                let pct = 0;
                if (data.total > 0) pct = Math.round((data.current / data.total) * 100);
                // 此时按钮功能已经是"中断"了，文字显示百分比
                btn.textContent = `❌ 中断 (${pct}%)`;
            }
        });
    }

    // ... (injectCSS, setButtonState 保持不变) ...
    injectCSS() {
        if (document.getElementById("path-fixer-style")) return;
        const styleElem = document.createElement('style');
        styleElem.id = "path-fixer-style";
        styleElem.textContent = `
            .fixer-dialog-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 9999; justify-content: center; align-items: center; }
            .fixer-dialog { background: #2b2b2b; border: 1px solid #444; box-shadow: 0 10px 30px rgba(0,0,0,0.8); padding: 20px; border-radius: 8px; width: 600px; max-width: 90%; max-height: 85vh; display: flex; flex-direction: column; color: #ddd; font-family: sans-serif; }
            .fixer-dialog h3 { margin-top: 0; border-bottom: 1px solid #444; padding-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
            .fixer-dialog-content { overflow-y: auto; flex-grow: 1; margin: 10px 0; padding-right: 5px; min-height: 100px; }
            .fixer-item { margin-bottom: 15px; padding: 12px; background: #222; border-radius: 5px; border: 1px solid #333; }
            .fixer-item label { display: block; margin-bottom: 8px; color: #ccc; font-size: 0.9em; line-height: 1.4; }
            .fixer-item select { width: 100%; background: #111; color: #fff; border: 1px solid #555; padding: 8px; border-radius: 4px; font-size: 13px; cursor: pointer; }
            .fixer-download-box { margin-bottom: 15px; padding: 12px; background: #2e1a1a; border-radius: 5px; border: 1px solid #552222; }
            .fixer-download-title { color: #ff6666; font-weight: bold; margin-bottom: 5px; display: block; font-size: 0.95em; }
            .fixer-download-btn { display: inline-block; margin-top: 8px; background: #2a7a3b; color: white; padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; vertical-align: middle; cursor: pointer; width: 120px; text-align: center; transition: background 0.2s linear; }
            .fixer-download-btn:hover { opacity: 0.9; }
            .fixer-section-title { font-size: 14px; color: #888; margin: 15px 0 8px 0; border-left: 3px solid #0072ff; padding-left: 8px; }
            .fixer-dialog-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; border-top: 1px solid #333; padding-top: 15px; }
            .fixer-btn-confirm { background: #0072ff; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            .fixer-btn-cancel { background: #555; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
            .fixer-processing { background: linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff) !important; background-size: 200% 100% !important; color: white !important; animation: fixerFlowEffect 2s ease infinite; cursor: wait !important; }
            @keyframes fixerFlowEffect { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        `;
        document.head.appendChild(styleElem);
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

    async showResultDialog(conflicts, downloads, unknowns, onConfirm) {
        // 获取当前活跃的任务
        const activeDownloads = await fetchActiveDownloads();
        const activeSet = new Set(activeDownloads);

        const overlay = document.createElement("div");
        overlay.className = "fixer-dialog-overlay";
        overlay.style.display = "flex";

        const dialog = document.createElement("div");
        dialog.className = "fixer-dialog";
        
        let title = "🔍 扫描结果";
        if (activeSet.size > 0) title = "⏳ 正在后台下载..."; // 标题根据状态变化
        else if (downloads.length > 0) title = "⬇️ 发现缺失模型 (可下载)";
        
        dialog.innerHTML = `
            <h3>${title}</h3>
            <div class="fixer-dialog-content" id="fixer-list"></div>
            <div class="fixer-dialog-footer">
                <button class="fixer-btn-cancel" id="fixer-cancel" type="button">关闭/后台下载</button>
                ${conflicts.length > 0 ? '<button class="fixer-btn-confirm" id="fixer-confirm" type="button">确认修复</button>' : ''}
            </div>
        `;

        const listContainer = dialog.querySelector("#fixer-list");

        // ... (Unknowns 渲染保持不变) ...
        if (unknowns.length > 0) {
            const unTitle = document.createElement("div");
            unTitle.className = "fixer-section-title";
            unTitle.textContent = `未收录模型 (${unknowns.length})`;
            listContainer.appendChild(unTitle);
            unknowns.forEach(item => {
                const div = document.createElement("div");
                div.className = "fixer-download-box";
                div.innerHTML = `<span class="fixer-download-title" style="color:#aaa">❓ ${item.old_value}</span><div style="font-size:12px; color:#666;">请手动下载</div>`;
                listContainer.appendChild(div);
            });
        }

        if (downloads.length > 0) {
            const dlTitle = document.createElement("div");
            dlTitle.className = "fixer-section-title";
            dlTitle.textContent = `缺失模型 (${downloads.length})`;
            listContainer.appendChild(dlTitle);

            downloads.forEach(item => {
                const div = document.createElement("div");
                div.className = "fixer-download-box";
                const justFileName = item.old_value.split(/[\\/]/).pop();
                const safeName = justFileName.replace(/[^\w\-\.]/g, '_');
                const isDownloading = activeSet.has(justFileName);

                div.innerHTML = `
                    <span class="fixer-download-title">MISSING: ${justFileName}</span>
                    <div style="font-size:12px; color:#aaa;">目标: /models/${item.model_type}/</div>
                    <div class="fixer-btn-group" style="margin-top:5px;"></div>
                `;
                
                const btnGroup = div.querySelector(".fixer-btn-group");
                const dlBtn = document.createElement("button");
                dlBtn.className = "fixer-download-btn";
                dlBtn.id = `btn-dl-${safeName}`;

                // [核心状态逻辑]
                if (isDownloading) {
                    // 如果正在下载 -> 显示为红色的"中断"按钮
                    dlBtn.textContent = "❌ 中断下载";
                    dlBtn.style.background = "#d32f2f"; // 红色
                    
                    // 绑定中断事件
                    dlBtn.onclick = async (e) => {
                        e.preventDefault();
                        if(!confirm("确定要中断下载吗？")) return;
                        
                        dlBtn.disabled = true;
                        dlBtn.textContent = "正在中断...";
                        const res = await cancelDownloadFromServer(justFileName);
                        if (!res.success) alert("中断失败: " + res.message);
                        // 成功的话，statusListener 会处理 UI 更新
                    };
                } else {
                    // 如果没在下载 -> 显示为绿色的"启动"按钮
                    dlBtn.textContent = "🚀 启动后台下载";
                    dlBtn.style.background = "#2a7a3b"; // 绿色
                    
                    // 绑定启动事件
                    dlBtn.onclick = async (e) => {
                        e.preventDefault();
                        dlBtn.disabled = true; // 防止重复点
                        dlBtn.textContent = "🚀 请求中...";
                        
                        const res = await downloadModelFromServer(item.download_url, justFileName, item.model_type);
                        
                        if (res.success) {
                            if (res.status === "exists") {
                                dlBtn.textContent = "✅ 文件已存在";
                                dlBtn.style.background = "#2a7a3b";
                            } else {
                                // 变成中断按钮
                                dlBtn.disabled = false;
                                dlBtn.textContent = "❌ 中断下载";
                                dlBtn.style.background = "#d32f2f";
                                // 重新绑定为中断逻辑
                                dlBtn.onclick = async () => {
                                    if(!confirm("确定要中断下载吗？")) return;
                                    await cancelDownloadFromServer(justFileName);
                                };
                            }
                        } else {
                            dlBtn.disabled = false;
                            dlBtn.textContent = "❌ 启动失败";
                            alert(res.message);
                        }
                    };
                }
                
                btnGroup.appendChild(dlBtn);
                listContainer.appendChild(div);
            });
        }

        // ... (Conflicts 渲染保持不变) ...
        if (conflicts.length > 0) {
            const cfTitle = document.createElement("div");
            cfTitle.className = "fixer-section-title";
            cfTitle.textContent = `路径冲突 (${conflicts.length})`;
            listContainer.appendChild(cfTitle);
            conflicts.forEach(item => {
                const div = document.createElement("div");
                div.className = "fixer-item";
                let optionsHtml = item.candidates.map(path => `<option value="${path}">${path}</option>`).join("");
                div.innerHTML = `<label>目标: <strong style="color:#aaa">${item.old_value}</strong></label><select id="sel-${item.id}-${item.widget_name}">${optionsHtml}</select>`;
                listContainer.appendChild(div);
            });
        }

        dialog.appendChild(listContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const closeDialog = (e) => {
            if(e) e.preventDefault();
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
            this.setButtonState(false);
        };
        const cancelBtn = dialog.querySelector("#fixer-cancel");
        if(cancelBtn) cancelBtn.onclick = closeDialog;
        const confirmBtn = dialog.querySelector("#fixer-confirm");
        if (confirmBtn) {
            confirmBtn.onclick = (e) => {
                e.preventDefault();
                const selectionMap = new Map();
                conflicts.forEach(item => {
                    const selectId = `sel-${item.id}-${item.widget_name}`;
                    const select = document.getElementById(selectId);
                    if (select) selectionMap.set(`${item.id}-${item.widget_name}`, select.value);
                });
                closeDialog();
                onConfirm(selectionMap);
            };
        }
    }
    
    // ... (addPanelButtons 保持不变) ...
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