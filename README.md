# 📖 阅读伴侣 Reading Companion

一个为实体英文书阅读设计的离线词典 + 番茄计时 + 生词管理工具。

## 功能

- **离线查词**：基于 ECDICT 开源英汉词典（77万词条），无需网络即可查词
- **番茄计时**：25分钟一个番茄，5/15/30分钟休息选择，每4个番茄建议长休息
- **生词本**：按书分类管理，支持中文笔记、搜索、TSV导出
- **数据统计**：14天柱状图、各书统计、番茄数量追踪
- **书架管理**：多本书独立管理，记录开始阅读日期
- **语音输入**：浏览器原生语音识别

## 部署步骤

### 前提条件

- [Node.js](https://nodejs.org/) 已安装（v16+）
- [Git](https://git-scm.com/) 已安装
- GitHub 账号

### 第一步：创建 GitHub 仓库

1. 打开 https://github.com/new
2. 仓库名填 `reading-companion`
3. 选择 Public
4. 点击 Create repository

### 第二步：克隆并设置项目

```bash
# 克隆仓库（替换 YOUR_USERNAME）
git clone https://github.com/YOUR_USERNAME/reading-companion.git
cd reading-companion
```

### 第三步：放入项目文件

将以下文件放入仓库根目录：
- `index.html`（主应用）
- `build-dict.js`（词库构建脚本）
- `README.md`（本文件）

### 第四步：构建离线词库

```bash
# 运行词库构建脚本（会自动下载 ECDICT 并处理）
node build-dict.js
```

这个脚本会：
1. 从 GitHub 下载 ECDICT 词库 CSV（约 30MB 压缩包）
2. 解析 77 万条词条
3. 按首字母分片为 26 个 JSON 文件
4. 输出到 `dict/` 目录

整个过程大约 1-2 分钟。

### 第五步：推送到 GitHub

```bash
# 添加 .gitignore（可选，排除临时文件）
echo ".temp/" > .gitignore

git add .
git commit -m "init: reading companion with offline dictionary"
git push origin main
```

### 第六步：开启 GitHub Pages

1. 打开仓库页面 → Settings → Pages
2. Source 选择 `Deploy from a branch`
3. Branch 选择 `main`，目录选 `/ (root)`
4. 点击 Save
5. 等待 1-2 分钟部署完成

### 第七步：访问

打开 `https://YOUR_USERNAME.github.io/reading-companion/`

建议在手机浏览器中添加到主屏幕，使用体验类似原生 APP。

## 数据说明

- 所有数据（书籍、生词、番茄记录）存储在浏览器 localStorage 中
- 数据只存在于当前设备和浏览器，清除浏览器数据会丢失
- 生词本支持 TSV 导出，建议定期导出备份

## 技术栈

- 纯 HTML/CSS/JS，零依赖，零构建工具
- ECDICT 开源英汉词典（MIT License）
- Web Speech API（语音输入）
- Web Audio API（番茄钟提示音）

## 词库来源

[ECDICT](https://github.com/skywind3000/ECDICT) by skywind3000，MIT License。

## 故障排查

**词库加载失败？**
- 确认 `dict/` 目录下有 `index.json` 和 `a.json` ~ `z.json`
- 确认 `node build-dict.js` 运行成功

**语音识别不工作？**
- 需要 HTTPS 环境（GitHub Pages 已是 HTTPS）
- 需要浏览器授权麦克风权限
- 部分浏览器不支持（推荐 Chrome/Safari）

**GitHub Pages 显示 404？**
- 确认 Pages 已开启且 Branch 设置正确
- 确认 `index.html` 在仓库根目录
