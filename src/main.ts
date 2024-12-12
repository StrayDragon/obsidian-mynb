import { App, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, Modal, ItemView, WorkspaceLeaf, Editor } from 'obsidian';

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
		return "obsidian-mynb-network-image-view";
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

		const noteList = container.createEl("div", { cls: "obsidian-mynb-network-image-list" });

		for (const note of this.notes) {
			const noteEl = noteList.createEl("div", { cls: "obsidian-mynb-network-image-item" });

			const titleEl = noteEl.createEl("div", {
				cls: "obsidian-mynb-network-image-title",
				text: note.file.basename
			});

			titleEl.addEventListener("click", async () => {
				await this.app.workspace.getLeaf().openFile(note.file);
			});

			const imageList = noteEl.createEl("div", { cls: "obsidian-mynb-network-image-urls" });
			for (const img of note.images) {
				imageList.createEl("div", {
					cls: "obsidian-mynb-network-image-url",
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
				// 功能-右键文件浏览器：添加文菜单项
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
							.setTitle("打开侧栏网络图片笔记视图")
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
			name: '统计: 打开文件数面板',
			callback: () => {
				new FilesCountStatisticsModal(this.app, this).open();
			}
		});

		// 视图-网络图片列表边栏
		this.registerView(
			"obsidian-mynb-network-image-view",
			(leaf) => new NetworkImageView(leaf, this)
		);

		// 添加网络图片查询命令
		this.addCommand({
			id: 'find-network-image-notes',
			name: '查询-网络图片笔记',
			callback: async () => {
				try {
					const notes = await this.findNetworkImageNotes(this.app.vault.getRoot());
					const view = await this.activateView();
					await view.setNotes(notes);
					new Notice(`找到 ${notes.length} 个包含网络图片的笔记`);
				} catch (error) {
					new Notice(`查询失败: ${error.message}`);
				}
			}
		});

		// 命令-重构所选文本中标题级别
		this.addCommand({
			id: 'adjust-heading-level',
			name: '重构-选中文本-调整标题级别',
			editorCallback: (editor) => {
				const selection = editor.getSelection();
				if (selection) {
					new HeadingLevelModal(this.app, editor).open();
				} else {
					new Notice('请先选择文本');
				}
			}
		});

		// 功能-右键编辑区选中文本: 重构所选文本中标题级别
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const selection = editor.getSelection();
				if (selection) {
					menu.addItem((item) => {
						item
							.setTitle("重构-调整标题级别")
							.setIcon("hash")
							.onClick(() => {
								new HeadingLevelModal(this.app, editor).open();
							});
					});
				}
			})
		);

		// 功能-右键编辑区: 选中所在章节
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				menu.addItem((item) => {
					item
						.setTitle("辅助-选中所在章节")
						.setIcon("text-select")
						.onClick(() => {
							this.selectCurrentSection(editor);
						});
				});
			})
		);

		// 在 MyNBPlugin 类的 onload() 方法中添加新命令
		this.addCommand({
			id: 'open-clean-empty-modal',
			name: '清理-打开空目录和空文件清理面板',
			callback: () => {
				new CleanEmptyModal(this.app, this).open();
			}
		});

		// 修改打开文件浏览器的命令回调
		this.addCommand({
			id: 'open-file-explorer',
			name: '打开文件浏览器',
			callback: async () => {
				const { workspace } = this.app;

				// 先尝试获取已存在的文件浏览器视图
				let leaf = workspace.getLeavesOfType("obsidian-mynb-file-explorer")[0];

				if (!leaf) {
					// 如果没有找到已存在的视图，创建新的
					const newLeaf = workspace.getLeftLeaf(false);
					if (newLeaf) {
						await newLeaf.setViewState({
							type: "obsidian-mynb-file-explorer"
						});
						leaf = newLeaf;
					}
				}

				// 如果成功获取或创建了叶子，则显示它
				if (leaf) {
					workspace.revealLeaf(leaf);
				} else {
					new Notice('无法创建文件浏览器视图');
				}
			}
		});

		// 注册文件浏览器视图
		this.registerView(
			"obsidian-mynb-file-explorer",
			(leaf) => new FileExplorerView(leaf, this)
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
		const leaves = workspace.getLeavesOfType("obsidian-mynb-network-image-view");

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) {
				leaf = workspace.getLeaf('split', 'vertical');
			}
			await leaf.setViewState({ type: "obsidian-mynb-network-image-view" });
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

	private selectCurrentSection(editor: Editor) {
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const lines = content.split('\n');

		let startLine = -1;
		for (let i = cursor.line; i >= 0; i--) {
			if (lines[i].match(/^#{1,6}\s/)) {
				startLine = i;
				break;
			}
		}

		if (startLine === -1) {
			new Notice('当前位置不在任何章节内');
			return;
		}

		const headingMatch = lines[startLine].match(/^(#{1,6})\s/);
		if (!headingMatch) {
			new Notice('无法识别标题级别');
			return;
		}
		const currentLevel = headingMatch[1].length;

		let endLine = lines.length;
		for (let i = startLine + 1; i < lines.length; i++) {
			const match = lines[i].match(/^(#{1,6})\s/);
			if (match && match[1].length <= currentLevel) {
				endLine = i;
				break;
			}
		}

		editor.setSelection(
			{ line: startLine, ch: 0 },
			{ line: endLine - 1, ch: lines[endLine - 1].length }
		);

		editor.scrollIntoView({ from: { line: startLine, ch: 0 }, to: { line: startLine, ch: 0 } });
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

class HeadingLevelModal extends Modal {
	editor: Editor;

	constructor(app: App, editor: Editor) {
		super(app);
		this.editor = editor;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '选择标题级别' });

		const buttonContainer = contentEl.createEl('div', { cls: 'obsidian-mynb-heading-level-buttons' });

		for (let i = 1; i <= 6; i++) {
			const button = buttonContainer.createEl('button', {
				text: `H${i}`,
				cls: 'obsidian-mynb-heading-level-button'
			});

			button.addEventListener('click', () => {
				this.adjustHeadingLevel(i);
				this.close();
			});
		}

		const removeButton = buttonContainer.createEl('button', {
			text: '移除标题',
			cls: 'obsidian-mynb-heading-level-button remove'
		});
		removeButton.addEventListener('click', () => {
			this.adjustHeadingLevel(0);
			this.close();
		});
	}

	adjustHeadingLevel(level: number) {
		const selection = this.editor.getSelection();
		if (!selection) return;

		const lines = selection.split('\n');
		const adjustedLines = lines.map(line => {
			// 只处理已经是标题的行
			if (line.match(/^#{1,6}\s/)) {
				// 移除所有的标题标记
				line = line.replace(/^#{1,6}\s/, '');

				// 添加新的标题标记（如果level为0则不添加）
				if (level > 0) {
					line = '#'.repeat(level) + ' ' + line;
				}
			}
			return line;
		});

		const newText = adjustedLines.join('\n');
		const from = this.editor.posToOffset(this.editor.getCursor('from'));
		const to = this.editor.posToOffset(this.editor.getCursor('to'));

		this.editor.replaceRange(newText,
			this.editor.offsetToPos(from),
			this.editor.offsetToPos(to)
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// 在文件末尾添加新的 Modal 类
class CleanEmptyModal extends Modal {
	app: App;
	plugin: MyNBPlugin;
	emptyItems: {
		path: string;
		type: 'folder' | 'file';
		selected: boolean;
		parent?: string;
		children: string[];
		count?: number;  // 用于显示文件夹包含的项目数
	}[] = [];
	selectAll: boolean = false;

	constructor(app: App, plugin: MyNBPlugin) {
		super(app);
		this.app = app;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 创建顶部操作容器
		const topBar = contentEl.createEl('div', {
			cls: 'obsidian-mynb-clean-empty-top-bar'
		});

		// 创建标题和按钮组容器
		const titleGroup = topBar.createEl('div', { cls: 'obsidian-mynb-clean-empty-title-group' });
		titleGroup.createEl('h2', { text: '清理空目录和空文件' });

		// 创建按钮组容器
		const buttonGroup = topBar.createEl('div', { cls: 'obsidian-mynb-clean-empty-button-group' });

		// 创建扫描按钮
		const scanButton = buttonGroup.createEl('button', {
			text: '扫描',
			cls: 'mod-cta'
		});
		scanButton.addEventListener('click', () => this.scanEmptyItems());

		// 创建全选/反选按钮
		const toggleAllButton = buttonGroup.createEl('button', {
			text: '全选',
			cls: 'obsidian-mynb-clean-empty-toggle-all'
		});
		toggleAllButton.addEventListener('click', () => {
			this.selectAll = !this.selectAll;
			this.updateSelections(resultContainer, toggleAllButton);
		});
		toggleAllButton.style.display = 'none';  // 初始隐藏

		// 创建结果容器
		const resultContainer = contentEl.createEl('div', {
			cls: 'obsidian-mynb-clean-empty-container'
		});

		// 创建底部操作按钮容器
		const actionContainer = contentEl.createEl('div', {
			cls: 'obsidian-mynb-clean-empty-actions'
		});
		actionContainer.style.display = 'none';

		// 创建删除按钮
		const deleteButton = actionContainer.createEl('button', {
			text: '删除所选项',
			cls: 'obsidian-mynb-clean-empty-delete'
		});
		deleteButton.addEventListener('click', () => this.deleteSelected(resultContainer));
	}

	private async scanEmptyItems() {
		this.emptyItems = [];
		const rootFolder = this.app.vault.getRoot();
		await this.scanFolder(rootFolder);

		const resultContainer = this.contentEl.querySelector('.obsidian-mynb-clean-empty-container') as HTMLElement;
		const actionContainer = this.contentEl.querySelector('.obsidian-mynb-clean-empty-actions') as HTMLElement;
		if (resultContainer && actionContainer) {
			resultContainer.empty();
			this.renderResults(resultContainer);

			const toggleAllButton = this.contentEl.querySelector('.obsidian-mynb-clean-empty-toggle-all') as HTMLElement;
			const actionContainer = this.contentEl.querySelector('.obsidian-mynb-clean-empty-actions') as HTMLElement;

			if (this.emptyItems.length > 0) {
				toggleAllButton.style.display = 'block';
				actionContainer.style.display = 'flex';
			} else {
				toggleAllButton.style.display = 'none';
				actionContainer.style.display = 'none';
			}
		}
	}

	private async scanFolder(folder: TFolder) {
		let hasContent = false;
		let currentFolderItems: string[] = [];

		for (const child of folder.children) {
			if (child instanceof TFolder) {
				const [hasSubContent, subItems] = await this.scanFolder(child);
				if (!hasSubContent) {
					const folderPath = child.path;
					this.emptyItems.push({
						path: folderPath,
						type: 'folder',
						selected: false,
						parent: folder.path === '/' ? undefined : folder.path,
						children: subItems,
						count: subItems.length
					});
					currentFolderItems.push(folderPath);
					currentFolderItems.push(...subItems);
				} else {
					hasContent = true;
				}
			} else if (child instanceof TFile) {
				const content = await this.app.vault.read(child);
				if (content.trim() === '') {
					const filePath = child.path;
					this.emptyItems.push({
						path: filePath,
						type: 'file',
						selected: false,
						parent: folder.path === '/' ? undefined : folder.path,
						children: []
					});
					currentFolderItems.push(filePath);
				} else {
					hasContent = true;
				}
			}
		}
		return [hasContent || folder.children.length === 0, currentFolderItems] as [boolean, string[]];
	}

	private renderResults(container: HTMLElement) {
		// 按照层级结构重新组织数据
		const itemsByParent = new Map<string | undefined, typeof this.emptyItems>();
		this.emptyItems.forEach(item => {
			const parentPath = item.parent;
			if (!itemsByParent.has(parentPath)) {
				itemsByParent.set(parentPath, []);
			}
			itemsByParent.get(parentPath)?.push(item);
		});

		// 渲染根级别的项目
		const rootItems = itemsByParent.get(undefined) || [];
		this.renderItemsLevel(container, rootItems, itemsByParent, 0);
	}

	private renderItemsLevel(
		container: HTMLElement,
		items: typeof this.emptyItems,
		itemsByParent: Map<string | undefined, typeof this.emptyItems>,
		level: number
	) {
		items.forEach((item) => {
			const itemEl = container.createEl('div', { cls: 'obsidian-mynb-clean-empty-item' });

			const rowContent = itemEl.createEl('div', {
				cls: 'obsidian-mynb-clean-empty-row',
				attr: { style: `padding-left: ${level * 20}px` }
			});

			// 添加复选框
			const checkbox = rowContent.createEl('input', {
				type: 'checkbox',
				cls: 'obsidian-mynb-clean-empty-checkbox'
			});
			checkbox.checked = item.selected;

			// 修改复选框的点击事件处理
			checkbox.addEventListener('change', (e) => {
				e.stopPropagation();
				const checked = (e.target as HTMLInputElement).checked;
				this.updateItemSelection(item.path, checked);
				this.refreshCheckboxes(container.closest('.obsidian-mynb-clean-empty-container') as HTMLElement);
			});

			const contentEl = rowContent.createEl('div', {
				cls: 'obsidian-mynb-clean-empty-content'
			});

			contentEl.createEl('span', {
				cls: `obsidian-mynb-clean-empty-icon ${item.type === 'folder' ? 'folder' : 'file'}`
			});

			const pathText = item.type === 'folder'
				? `${item.path} (${item.count} 项)`
				: item.path;

			contentEl.createEl('span', {
				text: pathText,
				cls: 'obsidian-mynb-clean-empty-path'
			});

			if (item.type === 'folder') {
				contentEl.addClass('is-folder');

				// 修改行点击事件，只处理折叠/展开
				rowContent.addEventListener('click', (e) => {
					const target = e.target as HTMLElement;
					if (target.tagName === 'INPUT') return;

					e.stopPropagation();
					const isCollapsed = itemEl.hasClass('is-collapsed');
					itemEl.toggleClass('is-collapsed', !isCollapsed);

					// 同时更新子容器的显示状态
					const childrenContainer = itemEl.querySelector('.obsidian-mynb-clean-empty-children');
					if (childrenContainer instanceof HTMLElement) {
						childrenContainer.toggleClass('is-collapsed', !isCollapsed);
					}
				});

				const childItems = itemsByParent.get(item.path) || [];
				if (childItems.length > 0) {
					const childrenContainer = itemEl.createEl('div', {
						cls: 'obsidian-mynb-clean-empty-children'
					});
					this.renderItemsLevel(childrenContainer, childItems, itemsByParent, level + 1);
				}
			}
		});
	}

	private updateItemSelection(path: string, selected: boolean) {
		// 更新当前项目
		const item = this.emptyItems.find(i => i.path === path);
		if (!item) return;
		item.selected = selected;

		// 更新子项目（如果是文件夹）
		if (item.type === 'folder') {
			this.emptyItems
				.filter(i => i.path.startsWith(path + '/'))
				.forEach(i => {
					i.selected = selected;
				});
		}

		// 更新父项目
		if (item.parent) {
			const parentItem = this.emptyItems.find(i => i.path === item.parent);
			if (parentItem) {
				const siblings = this.emptyItems.filter(i => i.parent === item.parent);
				const allSelected = siblings.every(i => i.selected);
				if (parentItem.selected !== allSelected) {
					parentItem.selected = allSelected;
					// 递归更新上层父项目
					this.updateItemSelection(parentItem.path, allSelected);
				}
			}
		}
	}

	private refreshCheckboxes(container: HTMLElement) {
		if (!container) return;

		const checkboxes = container.querySelectorAll('.obsidian-mynb-clean-empty-checkbox') as NodeListOf<HTMLInputElement>;
		checkboxes.forEach(checkbox => {
			const itemEl = checkbox.closest('.obsidian-mynb-clean-empty-item');
			if (!itemEl) return;

			const pathEl = itemEl.querySelector('.obsidian-mynb-clean-empty-path');
			if (!pathEl) return;

			const path = pathEl.textContent?.split(' (')[0];
			if (!path) return;

			const item = this.emptyItems.find(i => i.path === path);
			if (item) {
				checkbox.checked = item.selected;
			}
		});
	}

	private updateSelections(container: HTMLElement, toggleButton: HTMLButtonElement) {
		this.selectAll = !this.selectAll;
		this.emptyItems.forEach(item => {
			item.selected = this.selectAll;
		});

		// 更新所有复选框
		const checkboxes = container.querySelectorAll('.obsidian-mynb-clean-empty-checkbox') as NodeListOf<HTMLInputElement>;
		checkboxes.forEach(checkbox => {
			checkbox.checked = this.selectAll;
		});

		toggleButton.setText(this.selectAll ? '取消全选' : '全选');
	}

	private async deleteSelected(container: HTMLElement) {
		const selectedItems = this.emptyItems.filter(item => item.selected);
		if (selectedItems.length === 0) {
			new Notice('请先选择要删除的项目');
			return;
		}

		const confirmed = await new Promise<boolean>((resolve) => {
			const modal = new Modal(this.app);
			modal.contentEl.createEl('h2', { text: '确认删除' });
			modal.contentEl.createEl('p', { text: `确定要删除选中的 ${selectedItems.length} 个项目吗？` });

			const buttonContainer = modal.contentEl.createEl('div', { cls: 'obsidian-mynb-clean-empty-confirm' });

			const confirmButton = buttonContainer.createEl('button', {
				text: '确定',
				cls: 'mod-cta'
			});
			confirmButton.addEventListener('click', () => {
				modal.close();
				resolve(true);
			});

			const cancelButton = buttonContainer.createEl('button', {
				text: '取消'
			});
			cancelButton.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});

			modal.open();
		});

		if (!confirmed) return;

		let successCount = 0;
		let failCount = 0;

		for (const item of selectedItems) {
			try {
				const abstractFile = this.app.vault.getAbstractFileByPath(item.path);
				if (abstractFile) {
					await this.app.vault.delete(abstractFile);
					successCount++;
				}
			} catch (error) {
				this.plugin.debugLog(`Failed to delete ${item.path}:`, error);
				failCount++;
			}
		}

		new Notice(`删除完成: ${successCount} 个成功, ${failCount} 个失败`);
		await this.scanEmptyItems(); // 重新扫描并更新列表
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class FileExplorerView extends ItemView {
	plugin: MyNBPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MyNBPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return "obsidian-mynb-file-explorer";
	}

	getDisplayText(): string {
		return "文件浏览器";
	}

	async onOpen() {
		await this.refresh();
	}

	async refresh() {
		const container = this.containerEl.children[1];
		container.empty();

		// 创建文件树容器
		const treeContainer = container.createEl("div", {
			cls: "obsidian-mynb-file-tree"
		});

		// 从根目录开始渲染文件树
		await this.renderTree(this.app.vault.getRoot(), treeContainer, 0);
	}

	private async renderTree(folder: TFolder, container: HTMLElement, level: number) {
		// 创建文件夹项
		const folderEl = container.createEl("div", {
			cls: "obsidian-mynb-tree-item folder"
		});

		// 创建文件夹标题行
		const folderTitle = folderEl.createEl("div", {
			cls: "obsidian-mynb-tree-item-title"
		});

		// 添加文件夹图标
		folderTitle.createEl("span", {
			cls: "obsidian-mynb-tree-item-icon"
		});

		// 添加文件夹名称
		folderTitle.createEl("span", {
			text: folder.name || "/"
		});

		// 创建子项容器
		const childrenContainer = folderEl.createEl("div", {
			cls: "obsidian-mynb-tree-item-children"
		});

		// 处理子项
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				await this.renderTree(child, childrenContainer, level + 1);
			} else if (child instanceof TFile) {
				this.renderFile(child, childrenContainer, level + 1);
			}
		}

		// 添加点击事件处理展开/折叠
		folderTitle.addEventListener("click", () => {
			folderEl.toggleClass("collapsed", !folderEl.hasClass("collapsed"));
		});
	}

	private renderFile(file: TFile, container: HTMLElement, level: number) {
		const fileEl = container.createEl("div", {
			cls: "obsidian-mynb-tree-item file"
		});

		// 创建文件标题行
		const fileTitle = fileEl.createEl("div", {
			cls: "obsidian-mynb-tree-item-title"
		});

		// 添加文件图标
		fileTitle.createEl("span", {
			cls: "obsidian-mynb-tree-item-icon"
		});

		// 添加文件名称
		fileTitle.createEl("span", {
			text: file.name
		});

		// 添加点击事件以打开文件
		fileTitle.addEventListener("click", async () => {
			await this.app.workspace.getLeaf().openFile(file);
		});
	}
}
