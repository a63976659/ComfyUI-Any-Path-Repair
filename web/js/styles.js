export function injectCSS() {
    if (document.getElementById("path-fixer-style")) return;
    const style = document.createElement("style");
    style.id = "path-fixer-style";
    style.textContent = [
        ".fixer-toolbar-group{display:flex;align-items:center;flex-shrink:0;margin:0 4px}",
        ".fixer-toolbar-button,.fixer-action{background:var(--comfy-input-bg,#303030);color:var(--input-text,#ddd);border:1px solid var(--border-color,#555);border-radius:6px;padding:7px 12px;cursor:pointer;font:inherit;white-space:nowrap}",
        ".fixer-toolbar-button:hover,.fixer-action:hover{border-color:#409eff}",
        ".fixer-toolbar-button:disabled,.fixer-action:disabled{opacity:.6;cursor:default}",
        ".fixer-legacy-group{display:block;width:100%;margin:4px 0}.fixer-legacy-group .fixer-toolbar-button{width:100%}",
        ".fixer-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}",
        ".fixer-dialog{background:var(--comfy-menu-bg,#252525);color:var(--input-text,#ddd);border:1px solid var(--border-color,#555);box-shadow:0 12px 40px #0008;border-radius:12px;padding:22px;width:760px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;box-sizing:border-box;font:14px/1.5 sans-serif}",
        ".fixer-dialog h2{margin:0 0 6px;font-size:21px}.fixer-dialog h3{font-size:15px;margin:22px 0 10px}",
        ".fixer-dialog-content{overflow:auto;min-height:80px;padding-right:6px;overscroll-behavior:contain}",
        ".fixer-muted{color:var(--descrip-text,#999);margin:6px 0;font-size:12px;overflow-wrap:anywhere}",
        ".fixer-item{display:flex;flex-direction:column;gap:8px;background:var(--comfy-input-bg,#303030);border:1px solid var(--border-color,#444);padding:12px;border-radius:7px;margin-bottom:10px;overflow-wrap:anywhere}",
        ".fixer-select{width:100%;padding:8px;color:var(--input-text,#ddd);background:var(--comfy-input-bg,#222);border:1px solid var(--border-color,#555);border-radius:5px}",
        ".fixer-old-path{color:var(--descrip-text,#aaa)}.fixer-new-path{color:#45bc87}.fixer-warning{color:#e7a34d;margin:5px 0;overflow-wrap:anywhere}.fixer-warning:empty{display:none}",
        ".fixer-actions,.fixer-dialog-footer{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.fixer-dialog-footer{justify-content:flex-end;padding-top:16px;margin-top:16px;border-top:1px solid var(--border-color,#444)}",
        ".fixer-action{text-decoration:none;display:inline-block;font-size:13px;align-self:flex-start}.fixer-primary{background:#1673c9;color:white;border-color:#1673c9}.fixer-progress{width:100%;height:9px;accent-color:#409eff}",
        ".fixer-dialog [hidden]{display:none!important}.fixer-dialog :focus-visible,.fixer-toolbar-button:focus-visible{outline:2px solid #409eff;outline-offset:2px}",
        "@media(max-width:600px){.fixer-dialog-overlay{padding:8px}.fixer-dialog{padding:14px;max-height:95vh}.fixer-dialog-footer .fixer-action{flex:1}}"
    ].join("\n");
    document.head.appendChild(style);
}
