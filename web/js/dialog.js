import { fetchActiveDownloads, downloadModelFromServer, cancelDownloadFromServer } from "./utils.js";

export async function showResultDialog(uiInstance, conflicts, downloads, unknowns, onConfirm) {
    const activeDownloads = await fetchActiveDownloads();
    const activeSet = new Set(activeDownloads);

    const overlay = document.createElement("div");
    overlay.className = "fixer-dialog-overlay";
    overlay.style.display = "flex";

    const dialog = document.createElement("div");
    dialog.className = "fixer-dialog";
    
    let title = "🔍 扫描结果";
    if (activeSet.size > 0) title = "⏳ 正在后台下载...";
    else if (downloads.length > 0) title = "⬇️ 发现缺失模型 (可下载)";
    
    dialog.innerHTML = `
        <div class="fixer-notice-top">关闭页面，不影响后台模型下载！</div>

        <h3>${title}</h3>
        <div class="fixer-dialog-content" id="fixer-list"></div>
        <div class="fixer-dialog-footer">
            <button class="fixer-btn-cancel" id="fixer-cancel" type="button">关闭页面</button>
            ${conflicts.length > 0 ? '<button class="fixer-btn-confirm" id="fixer-confirm" type="button">确认修复</button>' : ''}
        </div>
    `;

    const listContainer = dialog.querySelector("#fixer-list");

    // 1. Unknowns
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

    // 2. Downloads (含中断逻辑 & 复制按钮)
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
            
            // --- A. 下载/中断按钮 ---
            const dlBtn = document.createElement("button");
            dlBtn.className = "fixer-download-btn";
            dlBtn.id = `btn-dl-${safeName}`;

            if (isDownloading) {
                dlBtn.textContent = "❌ 中断下载";
                dlBtn.style.background = "#d32f2f";
                dlBtn.onclick = async (e) => {
                    e.preventDefault();
                    if(!confirm("确定要中断下载吗？")) return;
                    dlBtn.disabled = true;
                    dlBtn.textContent = "正在中断...";
                    const res = await cancelDownloadFromServer(justFileName);
                    if (!res.success) alert("中断失败: " + res.message);
                };
            } else {
                dlBtn.textContent = "🚀 启动后台下载";
                dlBtn.style.background = "#2a7a3b";
                dlBtn.onclick = async (e) => {
                    e.preventDefault();
                    dlBtn.disabled = true;
                    dlBtn.textContent = "🚀 请求中...";
                    
                    const res = await downloadModelFromServer(item.download_url, justFileName, item.model_type);
                    if (res.success) {
                        if (res.status === "exists") {
                            dlBtn.textContent = "✅ 文件已存在";
                            dlBtn.style.background = "#2a7a3b";
                        } else {
                            dlBtn.disabled = false;
                            dlBtn.textContent = "❌ 中断下载";
                            dlBtn.style.background = "#d32f2f";
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
            
            // --- B. [新增] 复制链接按钮 ---
            const copyBtn = document.createElement("button");
            copyBtn.className = "fixer-copy-btn";
            copyBtn.textContent = "📋 复制链接";
            copyBtn.title = item.download_url; // 鼠标悬停显示完整链接
            
            copyBtn.onclick = async (e) => {
                e.preventDefault();
                try {
                    await navigator.clipboard.writeText(item.download_url);
                    // 视觉反馈
                    const originalText = "📋 复制链接";
                    copyBtn.textContent = "✅ 已复制";
                    copyBtn.style.background = "#2a7a3b";
                    copyBtn.style.borderColor = "#2a7a3b";
                    
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = "#444";
                        copyBtn.style.borderColor = "#666";
                    }, 1500);
                } catch (err) {
                    prompt("复制失败，请手动复制:", item.download_url);
                }
            };

            btnGroup.appendChild(dlBtn);
            btnGroup.appendChild(copyBtn); // 添加到按钮组
            
            listContainer.appendChild(div);
        });
    }

    // 3. Conflicts
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
        uiInstance.setButtonState(false);
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