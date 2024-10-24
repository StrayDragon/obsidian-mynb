# Obsidian MyNB

## 功能

- 右键文件浏览器：创建文件夹同名笔记

## 本地调试

### Linux

0. Clone本仓库安装依赖(`pnpm i`)后, 进入项目目录, 执行 `pnpm run build`
1. 使用 Obsidian 创建一个新的 Vault
2. 在 `<新的 Vault 目录>` 打开终端
3. `ln -s <本项目目录>/output/obsidian-mynb <新的 Vault 目录>/.obsidian/plugins/obsidian-mynb`
4. 重启 Obsidian, 在第三方插件设置中启用插件
