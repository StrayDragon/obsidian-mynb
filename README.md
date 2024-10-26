# Obsidian MyNB

## 功能

- 右键文件浏览器：创建文件夹同名笔记
![image](./docs/assets/add-same-dir-name-note-min.png)
- 命令: 文件数统计面板
![image](./docs/assets/open-files-count-statistics-panel-min.png)

## 安装

### 使用 BRAT

0. 在 Obsidian 中安装 [BRAT 插件](https://github.com/TfTHacker/obsidian42-brat) 并启用
1. 在 BRAT 插件设置中点击 'Add Beta plugin', 填写本仓库地址后点击 'Add Plugin'

## 本地调试

### Linux

0. Clone本仓库安装依赖(`pnpm i`)后, 进入项目目录, 执行 `pnpm run build`
1. 使用 Obsidian 创建一个新的 Vault
2. 在 `<新的 Vault 目录>` 打开终端
3. `ln -s <本项目目录>/output/obsidian-mynb <新的 Vault 目录>/.obsidian/plugins/obsidian-mynb`
4. 重启 Obsidian, 在第三方插件设置中启用插件

## 开发流程

0. 安装依赖 `pnpm i`
1. 修改代码
2. 根据 [本地调试](#本地调试) 中的步骤测试
3. (可选: 发布者处理) 检查并修改即将发布的版本号
  - `manifest.json`
  - `versions.json`
4. 提 PR 提交代码
