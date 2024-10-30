import { App, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, Modal, ItemView, WorkspaceLeaf } from 'obsidian';

const PLUGIN_NAME: string = "MyNBPlugin";

interface MyNBPluginSettings {
	enableDebugMode: boolean;
}

const DEFAULT_SETTINGS: MyNBPluginSettings = {
	enableDebugMode: false
}

interface NetworkImageNote {
	file: TFile;
	images: string[];
}

class NetworkImageView extends ItemView {
	notes: NetworkImageNote[] = [];
	plugin: MyNBPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MyNBPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return "network-image-view";
	}

	getDisplayText(): string {
		return "网络图片笔记";
	}

	async setNotes(notes: NetworkImageNote[]) {
		this.notes = notes;
		await this.refresh();
	}

	async refresh() {
		const container = this.containerEl.children[1];
		container.empty();

		const header = container.createEl("h3", { text: "包含网络图片的笔记" });

		if (this.notes.length === 0) {
			container.createEl("p", { text: "未找到包含网络图片的笔记" });
			return;
		}

		const noteList = container.createEl("div", { cls: "network-image-list" });

		for (const note of this.notes) {
			const noteEl = noteList.createEl("div", { cls: "network-image-item" });

			const titleEl = noteEl.createEl("div", {
				cls: "network-image-title",
				text: note.file.basename
			});

			titleEl.addEventListener("click", async () => {
				await this.app.workspace.getLeaf().openFile(note.file);
			});

			const imageList = noteEl.createEl("div", { cls: "network-image-urls" });
			for (const img of note.images) {
				imageList.createEl("div", {
					cls: "network-image-url",
					text: img
				});
			}
		}
	}
}

export default class MyNBPlugin extends Plugin {
	settings: MyNBPluginSettings;

	debugLog(message: string, ...args: any[]) {
		if (this.settings.enableDebugMode) {
			console.log(`[${PLUGIN_NAME}] ${message}`, ...args);
		}
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MyNBPluginSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				// 功能-右键文件浏览器：添加文件菜单项
				if (file instanceof TFolder && file.path !== "/") {
					menu.addItem((item) => {
						item
							.setTitle("创建文件夹同名笔记")
							.setIcon("file-plus-2")
							.onClick(async () => {
								try {
									const folderName = file.name;
									const newFilePath = `${file.path}/${folderName}.md`;

									if (this.app.vault.getAbstractFileByPath(newFilePath) instanceof TFile) {
										throw new Error("文件已存在");
									}

									await this.app.vault.create(newFilePath, "");
									new Notice(`成功创建笔记: ${folderName}`);
								} catch (error) {
									new Notice(`创建笔记失败: ${error.message}`);
								}
							});
					});
				}

				// 功能-右键文件浏览器: 笔记转换为同名文件夹功能
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) => {
						item
							.setTitle("转换为同名文件夹")
							.setIcon("folder-input")
							.onClick(async () => {
								try {
									if (!file.parent) {
										throw new Error("无法在根目录执行此操作");
									}

									const noteName = file.basename;
									const folderPath = `${file.parent.path}/${noteName}`;
									if (this.app.vault.getAbstractFileByPath(folderPath) instanceof TFolder) {
										throw new Error("同名文件夹已存在");
									}

									await this.app.vault.createFolder(folderPath);
									await this.app.fileManager.renameFile(
										file,
										`${folderPath}/${noteName}.md`
									);

									new Notice(`成功将笔记转换为文件夹: ${noteName}`);
								} catch (error) {
									new Notice(`转换失败: ${error.message}`);
								}
							});
					});
				}

				// 功能-右键文件浏览器: 查询有网络图片的笔记
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle("查询有网络图片的笔记")
							.setIcon("search")
							.onClick(async () => {
								try {
									const notes = await this.findNetworkImageNotes(file);
									const view = await this.activateView();
									await view.setNotes(notes);
									new Notice(`找到 ${notes.length} 个包含网络图片的笔记`);
								} catch (error) {
									new Notice(`查询失败: ${error.message}`);
								}
							});
					});
				}
			})
		);

		// 命令-文件数统计面板
		this.addCommand({
			id: 'open-files-count-statistics-panel',
			name: 'open files count statistics panel',
			callback: () => {
				new FilesCountStatisticsModal(this.app, this).open();
			}
		});

		this.registerView(
			"network-image-view",
			(leaf) => new NetworkImageView(leaf, this)
		);
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType("network-image-view");

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) {
				leaf = workspace.getLeaf('split', 'vertical');
			}
			await leaf.setViewState({ type: "network-image-view" });
		}

		workspace.revealLeaf(leaf);
		return leaf.view as NetworkImageView;
	}

	isNetworkUrl(url: string): boolean {
		return url.startsWith("http://") || url.startsWith("https://");
	}

	async findNetworkImageNotes(folder: TFolder): Promise<NetworkImageNote[]> {
		const results: NetworkImageNote[] = [];

		const searchFiles = async (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === "md") {
					const content = await this.app.vault.read(child);
					const imageRegex = /!\[.*?\]\((.*?)\)/g;
					const matches = [...content.matchAll(imageRegex)];

					const networkImages = matches
						.map(match => match[1])
						.filter(url => this.isNetworkUrl(url));

					if (networkImages.length > 0) {
						results.push({
							file: child,
							images: networkImages
						});
					}
				} else if (child instanceof TFolder) {
					await searchFiles(child);
				}
			}
		};

		await searchFiles(folder);
		return results;
	}
}

class FilesCountStatisticsModal extends Modal {
	app: App;
	notes: TFile[] = [];
	sortOrder: 'asc' | 'desc' = 'asc';
	sortBy: 'name' | 'mtime' | 'ctime' = 'name';
	extension: string = '';
	useRegex: boolean = false;
	folderCounts: Map<string, number> = new Map();
	expandedFolders: Set<string> = new Set();
	plugin: MyNBPlugin;

	constructor(app: App, plugin: MyNBPlugin) {
		super(app);
		this.app = app;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '文件数统计' });

		const controlsEl = contentEl.createEl('div', { cls: 'obsidian-mynb-controls' });

		this.createSortSelector(controlsEl);
		this.createExtensionSelector(controlsEl);
		this.createRegexCheckbox(controlsEl);

		this.contentEl.createEl('div', { cls: 'obsidian-mynb-folder-list' });
		this.updateFolderList();
	}

	private createSortSelector(container: HTMLElement) {
		const sortSelect = container.createEl('select', { cls: 'obsidian-mynb-sort-select' });
		const sortOptions = [
			{ value: 'name_asc', text: '名称 (A-Z)' },
			{ value: 'name_desc', text: '名称 (Z-A)' },
			{ value: 'mtime_desc', text: '编辑时间 (从新到旧)' },
			{ value: 'mtime_asc', text: '编辑时间 (从旧到新)' },
			{ value: 'ctime_desc', text: '创建时间 (从新到旧)' },
			{ value: 'ctime_asc', text: '创建时间 (从旧到新)' },
		];

		sortOptions.forEach(option => {
			sortSelect.createEl('option', { value: option.value, text: option.text });
		});

		sortSelect.value = `${this.sortBy}_${this.sortOrder}`;
		sortSelect.addEventListener('change', () => {
			const [sortBy, sortOrder] = sortSelect.value.split('_');
			this.sortBy = sortBy as 'name' | 'mtime' | 'ctime';
			this.sortOrder = sortOrder as 'asc' | 'desc';
			this.updateFolderList();
		});
	}

	private createExtensionSelector(container: HTMLElement) {
		const extensionSelect = container.createEl('select', { cls: 'obsidian-mynb-extension-select' });
		const commonExtensions = ['', 'md', 'txt', 'pdf', 'png', 'jpg'];
		commonExtensions.forEach(ext => {
			extensionSelect.createEl('option', { value: ext, text: ext ? `.${ext}` : '所有文件' });
		});
		extensionSelect.createEl('option', { value: 'custom', text: '自定' });
		extensionSelect.value = this.extension || '';
		extensionSelect.addEventListener('change', () => this.handleExtensionChange(extensionSelect));

		const customInput = this.createCustomExtensionInput(container);
		this.addExtensionChangeListener(customInput);
	}

	private handleExtensionChange(extensionSelect: HTMLSelectElement) {
		const customInput = this.contentEl.querySelector('.obsidian-mynb-custom-extension') as HTMLInputElement;
		if (extensionSelect.value === 'custom') {
			customInput.style.display = 'inline-block';
			this.extension = customInput.value;
		} else {
			customInput.style.display = 'none';
			this.extension = extensionSelect.value;
		}
		this.updateFolderList();
	}

	private createCustomExtensionInput(container: HTMLElement): HTMLInputElement {
		const customInput = container.createEl('input', {
			cls: 'obsidian-mynb-custom-extension',
			type: 'text',
			placeholder: '输入自定义扩展名或正则表达式'
		});
		customInput.style.display = 'none';
		return customInput;
	}

	private addExtensionChangeListener(customInput: HTMLInputElement) {
		customInput.addEventListener('change', () => {
			this.extension = customInput.value;
			this.updateFolderList();
		});
	}

	private createRegexCheckbox(container: HTMLElement) {
		const regexCheckbox = container.createEl('input', {
			cls: 'obsidian-mynb-regex-checkbox',
			type: 'checkbox'
		});
		regexCheckbox.checked = this.useRegex;
		regexCheckbox.addEventListener('change', () => {
			this.useRegex = regexCheckbox.checked;
			this.updateFolderList();
		});
		container.createEl('label', { text: '使用正则表达式', attr: { for: 'obsidian-mynb-regex-checkbox' } });
	}

	async updateFolderList() {
		const container = this.contentEl.querySelector('.obsidian-mynb-folder-list');
		if (!container) return;
		container.empty();

		this.calculateFolderCounts();
		await this.renderFolder(this.app.vault.getRoot(), container as HTMLElement, 0);
	}

	async renderFolder(folder: TFolder, container: HTMLElement, level: number) {
		const folderEl = container.createEl('div', { cls: 'obsidian-mynb-folder' });
		folderEl.style.paddingLeft = `${level * 20}px`;

		folderEl.createEl('span', {
			cls: 'obsidian-mynb-folder-icon',
		});

		folderEl.createEl('span', {
			cls: 'obsidian-mynb-folder-name',
			text: folder.name || '/'
		});

		folderEl.createEl('span', {
			cls: 'obsidian-mynb-count-badge',
			text: `${this.folderCounts.get(folder.path) || 0}`
		});

		// 如果文件夹已展开，添加对应的类
		if (this.expandedFolders.has(folder.path)) {
			folderEl.addClass('obsidian-mynb-folder-open');
		}

		folderEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleFolder(folder.path, folderEl);
		});

		// 如果文件夹已展开，直接渲染子文件夹
		if (this.expandedFolders.has(folder.path)) {
			const subFolders = folder.children.filter(child => child instanceof TFolder) as TFolder[];
			await this.sortFolders(subFolders);
			for (const subFolder of subFolders) {
				await this.renderFolder(subFolder, container, level + 1);
			}
		}
	}

	async toggleFolder(folderPath: string, folderEl: HTMLElement) {
		if (this.expandedFolders.has(folderPath)) {
			// 关闭文件夹
			this.expandedFolders.delete(folderPath);
			folderEl.removeClass('obsidian-mynb-folder-open');
			let nextEl = folderEl.nextElementSibling;
			while (nextEl && nextEl.classList.contains('obsidian-mynb-folder') &&
				(nextEl as HTMLElement).style.paddingLeft > folderEl.style.paddingLeft) {
				const current = nextEl;
				nextEl = nextEl.nextElementSibling;
				current.remove();
			}
		} else {
			// 展开文件夹
			this.expandedFolders.add(folderPath);
			folderEl.addClass('obsidian-mynb-folder-open');

			// 获取文件夹对象
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (folder instanceof TFolder) {
				const subFolders = folder.children.filter(child => child instanceof TFolder) as TFolder[];
				await this.sortFolders(subFolders);

				// 找到当前文件夹的下一个同级元素（如果有的话）
				let nextSiblingEl = folderEl.nextElementSibling;
				while (nextSiblingEl &&
					   nextSiblingEl.classList.contains('obsidian-mynb-folder') &&
					   (nextSiblingEl as HTMLElement).style.paddingLeft > folderEl.style.paddingLeft) {
					nextSiblingEl = nextSiblingEl.nextElementSibling;
				}

				const parentEl = folderEl.parentElement;
				if (!parentEl) return;

				const nextLevel = parseInt(folderEl.style.paddingLeft) / 20 + 1;

				// 为每个子文件夹创建元素
				for (const subFolder of subFolders) {
					const subFolderEl = document.createElement('div');
					await this.renderFolder(subFolder, subFolderEl, nextLevel);

					// 如果存在下一个同级元素，在它之前插入
					if (nextSiblingEl) {
						parentEl.insertBefore(subFolderEl.firstChild!, nextSiblingEl);
					} else {
						// 否则添加到父元素末尾
						parentEl.appendChild(subFolderEl.firstChild!);
					}
				}
			}
		}
	}

	calculateFolderCounts() {
		this.folderCounts.clear();
		const recurse = (folder: TFolder) => {
			let count = 0;
			folder.children.forEach(child => {
				if (child instanceof TFile) {
					if (this.matchesExtension(child.extension)) {
						count++;
					}
				} else if (child instanceof TFolder) {
					count += recurse(child);
				}
			});
			this.folderCounts.set(folder.path, count);
			return count;
		};
		recurse(this.app.vault.getRoot());
	}

	matchesExtension(fileExtension: string): boolean {
		if (!this.extension) return true;
		if (this.useRegex) {
			try {
				const regex = new RegExp(this.extension);
				return regex.test(fileExtension);
			} catch (e) {
				this.plugin.debugLog("Invalid regex:", e);
				return false;
			}
		}
		return fileExtension === this.extension;
	}

	async sortFolders(folders: TFolder[]) {
		const folderStats = await Promise.all(folders.map(async folder => {
			try {
				const stat = await this.app.vault.adapter.stat(folder.path);
				return { folder, stat };
			} catch (error) {
				this.plugin.debugLog("Error getting file stats:", error);
				return { folder, stat: null };
			}
		}));

		folderStats.sort((a, b) => {
			switch (this.sortBy) {
				case 'name':
					return this.sortOrder === 'asc' ? a.folder.name.localeCompare(b.folder.name) : b.folder.name.localeCompare(a.folder.name);
				case 'mtime':
				case 'ctime':
					if (a.stat && b.stat) {
						const timeA = this.sortBy === 'mtime' ? a.stat.mtime : a.stat.ctime;
						const timeB = this.sortBy === 'mtime' ? b.stat.mtime : b.stat.ctime;
						return this.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
					}
					return 0;
				default:
					return 0;
			}
		});

		return folderStats.map(item => item.folder);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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
			.setName('启用调试模式')
			.setDesc('启用后，插件将在控制台输出调试信息')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugMode)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugMode = value;
					await this.plugin.saveSettings();
				}));
	}
}
