# 🔧 ComfyUI Any Path Repair
ComfyUI任意模型路径修复工具 (模型路径智能修复)
告别“红框”报错，一键修复 ComfyUI 模型加载器路径错误。

导入别人的工作流（Workflow）时，你是否经常遇到满屏的红色节点？
仅仅因为对方把模型放在 `其它` 文件夹，而你放在根目录，ComfyUI 就无法识别？
**ComfyUI Any Path Repair** 旨在解决这个问题，它能智能识别文件名，自动忽略路径差异，一键修复所有模型引用错误。

---

## ✨ 核心亮点 (Highlights)

### 1. 🚀 极致轻量与零计算负担 (Zero Computation Overhead)

这是本插件最引以为傲的设计原则。

* **0 VRAM 占用**：本插件仅进行字符串逻辑匹配，**绝不加载任何模型到显存**。无论你的显卡是 4090 还是集显，使用体验完全一致。
* **被动触发机制**：插件不会在后台持续运行或监听，只有当你点击“修复”按钮的那一刻才会执行，执行时间通常在 **0.01秒** 级。
* **不影响生成速度**：完全独立于生成线程，对 ComfyUI 的生图性能没有任何干扰。

### 2. 🧠 智能路径穿透 (Smart Path Penetration)

不再受限于对方的文件夹整理习惯。

* **场景举例**：
* 工作流记录路径：`models/checkpoints/SD1.5/Anime/counterfeit-v3.safetensors`
* 你的本地路径：`checkpoints/counterfeit-v3.safetensors`


* **结果**：原生 ComfyUI 会报错丢失模型，本插件能通过**文件名指纹**自动匹配到你本地的正确文件，并自动更新节点。

### 3. 🛡️ 全模型类型覆盖

不仅支持大模型（Checkpoints），还全面支持：

* LoRA / LyCORIS
* VAE
* ControlNet
* CLIP Vision
* UNet / CLIP
* Upscale Models (放大模型)
* Embeddings

### 4. 🎨 双 UI 完美适配

无论你是习惯使用**旧版侧边栏菜单**，还是喜欢 **ComfyUI V1 新版顶部栏**，本插件都能自动识别并完美融入，提供丝滑的原生级交互体验。

---

## 🛠️ 安装与使用 (How to Use)

### 安装

方法1
1. 点击页面上方的code，点击Download ZIP。
2. 下载解压：
 进入 `ComfyUI/custom_nodes/` 目录，解压并重启ComfyUI 。
 
方法2
1. 在 `ComfyUI/custom_nodes/` 文件夹右键。
2. 选择在终端中打开（或者文件地址栏输入cmd）。
3. 输入git clone https://github.com/a63976659/ComfyUI-Any-Path-Repair.git并回车。
4. 安装完成后，重启ComfyUI

* **注意**：git失败，参考此视频教程安装 `https://www.bilibili.com/video/BV1ecMnzQEfc/`。



### 使用方法

1. 加载一个工作流，提示模型缺失，报错（显示红色）。
2. 点击菜单栏中的 **"🔧 修复模型路径" (Fix Paths)** 按钮。
* *旧版 UI*：按钮位于右侧菜单面板。
* *新版 UI*：按钮位于顶部设置栏附近。


3. 插件会自动扫描所有报错节点，匹配本地模型，并弹窗报告修复结果。
4. 点击“执行”即可正常生图！

---

## ⚡ 性能技术指标

| 指标 | 说明 |
| --- | --- |
| **显存占用 (VRAM)** | **0 MB** (不加载任何 pytorch 模型) |
| **内存占用 (RAM)** | < 1 MB (仅用于存储简单的 JS 交互逻辑) |
| **硬盘 I/O** | 极低 (仅读取文件列表，不读取文件内容) |
| **依赖库** | 无第三方依赖 (仅使用 Python 原生库) |

---

## 📥 常见问题

**Q: 如果我有两个同名文件在不同文件夹怎么办？**
A: 插件会优先匹配 ComfyUI 默认加载路径中的第一个匹配项。建议保持模型文件名的唯一性以获得最佳体验。

**Q: 修改了节点后会破坏原始工作流吗？**
A: 插件仅修改当前页面上节点的“选中值”，不会修改你硬盘上的任何文件，安全无忧。

---

**ComfyUI Any Path Repair** —— 让分享与复现变得简单。
---

如果你觉得插件还不错可以点个收藏。

我的哔哩哔哩主页：https://space.bilibili.com/2114638644

我的小红书：猪的飞行梦

ComfyUI交流QQ群：202018000

想支持一下作者可以扫个码😀😀😀
养家版二维码❥(^_-)
![收款二维码](https://github.com/user-attachments/assets/687a3fc3-2511-47c7-bc71-1e06527dbe01)

