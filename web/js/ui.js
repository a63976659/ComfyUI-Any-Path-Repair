import { $el } from "../../../scripts/ui.js";
import { error } from "./utils.js";

export class FixerUI {
    
    constructor(onClickHandler) {
        this.onClickHandler = onClickHandler;
        this.buttonElement = null; // 保存按钮引用以便修改状态
        this.injectCSS();
    }

    /**
     * 注入参考风格的 CSS
     * 包含流光动画效果
     */
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
            
            /* 处理中状态 - 类似参考代码的 active */
            .fixer-btn-processing {
                background: linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff);
                background-size: 200% 100%;
                color: white !important;
                border: none;
                animation: fixerFlowEffect 2s ease infinite;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: 0 0 8px rgba(0, 198, 255, 0.4);
                cursor: wait !important;
            }
            
            /* 正常/空闲状态 - 类似参考代码的 inactive */
            .fixer-btn-idle {
                background: linear-gradient(90deg, #383838, #4a4a4a);
                color: #e0e0e0;
                border: 1px solid rgba(255,255,255,0.1);
                transition: all 0.3s ease;
            }

            .fixer-btn-idle:hover {
                background: #5a5a5a;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }

            .fixer-btn {
                cursor: pointer;
                border-radius: 4px; /* 旧版圆角 */
                padding: 4px 10px;
                font-size: 12px;
                font-weight: bold;
            }
        `;
        document.head.appendChild(styleElem);
    }

    /**
     * 设置按钮状态 (UI 反馈)
     * @param {boolean} isProcessing 是否正在处理
     * @param {string} text 按钮文字
     */
    setButtonState(isProcessing, text = null) {
        if (!this.buttonElement) return;

        // 移除旧类
        this.buttonElement.classList.remove("fixer-btn-processing", "fixer-btn-idle");

        if (isProcessing) {
            this.buttonElement.classList.add("fixer-btn-processing");
            if(text) this.buttonElement.textContent = text; // ComfyUI V1 可能会覆盖这个，需注意
            
            // 针对 V1 UI 的特殊处理
            if (this.buttonElement.setLabel) {
                 this.buttonElement.setLabel(text || "修复中...");
            }
        } else {
            this.buttonElement.classList.add("fixer-btn-idle");
            const defaultText = "🔧 修复路径";
            if(text) this.buttonElement.textContent = text;
            else this.buttonElement.textContent = defaultText;

            if (this.buttonElement.setLabel) {
                this.buttonElement.setLabel(text || defaultText);
           }
        }
    }

    /**
     * 在界面上添加按钮
     * 自动检测新旧 UI
     */
    addPanelButtons(app) {
        try {
            // 1. 尝试添加到新版 UI (ComfyUI V1)
            // 参考了 main.js 中 window.comfyAPI 的判断逻辑
            if (window?.comfyAPI?.button?.ComfyButton && window?.comfyAPI?.buttonGroup?.ComfyButtonGroup) {
                this.addButtonsToNewUI(app);
            } 
            // 2. 回退到旧版 UI (侧边栏)
            else if (document.querySelector(".comfy-menu")) {
                this.addButtonsToOldUI(app);
            }
        } catch (e) {
            error("添加面板按钮失败:", e);
        }
    }

    addButtonsToOldUI(app) {
        if (document.getElementById("path-fixer-button")) return;

        const btn = $el("button.fixer-btn.fixer-btn-idle", {
            id: "path-fixer-button",
            textContent: "🔧 修复模型路径",
            title: "扫描并修复丢失引用的模型路径",
            style: {
                marginBottom: "4px" // 给一点间距
            },
            onclick: async () => {
                await this.onClickHandler(this);
            },
        });

        this.buttonElement = btn;
        
        // 插入到 Refresh 按钮之前，或者菜单末尾
        const menu = app.ui.menuContainer;
        const refreshBtn = document.getElementById("comfy-refresh-button");
        if (refreshBtn) {
            menu.insertBefore(btn, refreshBtn);
        } else {
            menu.appendChild(btn);
        }
    }

    addButtonsToNewUI(app) {
        const ComfyButtonGroup = window.comfyAPI.buttonGroup.ComfyButtonGroup;
        const ComfyButton = window.comfyAPI.button.ComfyButton;

        const btn = new ComfyButton({
            action: async () => {
                await this.onClickHandler(this);
            },
            tooltip: "扫描并修复丢失引用的模型路径",
            content: "🔧 修复路径",
            classList: "fixer-btn fixer-btn-idle" // 添加我们的 CSS 类
        });

        this.buttonElement = btn.element; // 获取原生 DOM 元素
        // 赋予 V1 按钮修改文字的方法引用，方便 setButtonState 调用
        this.buttonElement.setLabel = (txt) => { btn.element.innerText = txt; };

        const group = new ComfyButtonGroup(btn.element);
        
        // 尝试插入到顶部菜单栏 (app.menu.settingsGroup 是参考代码中的位置)
        if (app.menu?.settingsGroup?.element) {
            app.menu.settingsGroup.element.before(group.element);
        } else {
            // 如果找不到设置组，尝试添加到页面主体顶部或其他容器
            document.body.append(group.element); 
            group.element.style.position = "absolute";
            group.element.style.top = "10px";
            group.element.style.right = "250px"; // 粗略定位
        }
    }
}