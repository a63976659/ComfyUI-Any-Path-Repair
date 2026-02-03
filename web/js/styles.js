export function injectCSS() {
    if (document.getElementById("path-fixer-style")) return;
    const styleElem = document.createElement('style');
    styleElem.id = "path-fixer-style";
    styleElem.textContent = `
        /* 遮罩层 */
        .fixer-dialog-overlay { 
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.6); z-index: 9999; 
            justify-content: center; align-items: center; 
        }
        
        /* 弹窗主体 */
        .fixer-dialog { 
            background: #2b2b2b; border: 1px solid #444; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.8); padding: 20px; border-radius: 8px; 
            width: 600px; max-width: 90%; 
            max-height: 85vh; 
            display: flex; flex-direction: column; 
            color: #ddd; font-family: sans-serif; 
        }

        /* 顶部大字提示 */
        .fixer-notice-top {
            font-size: 18px; font-weight: bold; color: #00e676; 
            text-align: center; margin-bottom: 15px; padding-bottom: 15px; 
            border-bottom: 1px dashed #444; letter-spacing: 1px;
        }
        
        .fixer-dialog h3 { 
            margin-top: 0; border-bottom: 1px solid #444; padding-bottom: 10px; 
            display: flex; align-items: center; justify-content: space-between; 
            flex-shrink: 0;
        }
        
        /* 内容区域滚动条 */
        .fixer-dialog-content { 
            overflow-y: auto; flex-grow: 1; margin: 10px 0; padding-right: 8px;
            min-height: 100px; max-height: 60vh; 
            scrollbar-width: thin; scrollbar-color: #555 #2b2b2b;
        }
        
        .fixer-dialog-content::-webkit-scrollbar { width: 8px; }
        .fixer-dialog-content::-webkit-scrollbar-track { background: #2b2b2b; }
        .fixer-dialog-content::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        .fixer-dialog-content::-webkit-scrollbar-thumb:hover { background: #777; }
        
        /* 列表项样式 */
        .fixer-item { margin-bottom: 15px; padding: 12px; background: #222; border-radius: 5px; border: 1px solid #333; }
        .fixer-item label { display: block; margin-bottom: 8px; color: #ccc; font-size: 0.9em; line-height: 1.4; }
        .fixer-item select { width: 100%; background: #111; color: #fff; border: 1px solid #555; padding: 8px; border-radius: 4px; font-size: 13px; cursor: pointer; }
        
        /* 下载框样式 */
        .fixer-download-box { margin-bottom: 15px; padding: 12px; background: #2e1a1a; border-radius: 5px; border: 1px solid #552222; }
        .fixer-download-title { color: #ff6666; font-weight: bold; margin-bottom: 5px; display: block; font-size: 0.95em; }
        
        /* 下载按钮 */
        .fixer-download-btn { 
            display: inline-block; margin-top: 8px; background: #2a7a3b; color: white; 
            padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; 
            vertical-align: middle; cursor: pointer; width: 120px; text-align: center;
            transition: background 0.2s linear;
        }
        .fixer-download-btn:hover { opacity: 0.9; }
        .fixer-download-btn:disabled { cursor: not-allowed; opacity: 1.0; }

        /* [新增] 复制按钮 */
        .fixer-copy-btn { 
            display: inline-block; margin-top: 8px; margin-left: 8px;
            background: #444; color: white;
            padding: 6px 12px; border: 1px solid #666; border-radius: 4px;
            font-size: 12px; cursor: pointer; vertical-align: middle;
            transition: all 0.2s;
        }
        .fixer-copy-btn:hover { background: #555; border-color: #777; }
        
        /* 辅助样式 */
        .fixer-section-title { font-size: 14px; color: #888; margin: 15px 0 8px 0; border-left: 3px solid #0072ff; padding-left: 8px; }
        .fixer-dialog-footer { 
            display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; 
            border-top: 1px solid #333; padding-top: 15px; flex-shrink: 0; 
        }
        .fixer-btn-confirm { background: #0072ff; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .fixer-btn-cancel { background: #555; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        
        .fixer-processing { background: linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff) !important; background-size: 200% 100% !important; color: white !important; animation: fixerFlowEffect 2s ease infinite; cursor: wait !important; }
        @keyframes fixerFlowEffect { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
    `;
    document.head.appendChild(styleElem);
}