import { App, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile } from 'obsidian';

interface MyNBPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyNBPluginSettings = {
	mySetting: 'default'
}

export default class MyNBPlugin extends Plugin {
	settings: MyNBPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MyNBPluginSettingTab(this.app, this));

		// 功能-右键文件浏览器：添加文件菜单项
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFolder && file.path !== "/") {
					menu.addItem((item) => {
						item
							.setTitle("创建文件夹同名笔记")
							.setIcon("document")
							.onClick(async () => {
								try {
									const folderName = file.name;
									const newFilePath = `${file.path}/${folderName}.md`;

									// 检查文件是否已存在
									if (this.app.vault.getAbstractFileByPath(newFilePath) instanceof TFile) {
										throw new Error("同名文件已存在");
									}

									await this.app.vault.create(newFilePath, "");
									new Notice(`成功创建笔记: ${folderName}`);
								} catch (error) {
									new Notice(`创建笔记失败: ${error.message}`);
								}
							});
					});
				}
			})
		);
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MyNBPluginSettingTab extends PluginSettingTab {
	plugin: MyNBPlugin;

	constructor(app: App, plugin: MyNBPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
