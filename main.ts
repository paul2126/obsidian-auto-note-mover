import {
	MarkdownView,
	Plugin,
	TFile,
	getAllTags,
	Notice,
	parseFrontMatterStringArray,
	TAbstractFile,
	normalizePath,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	AutoNoteMoverSettings,
	AutoNoteMoverSettingTab,
} from "settings/settings";
import { fileMove, getTriggerIndicator, isFmDisable } from "utils/Utils";

async function retryWithDelay<T>(
	fn: () => Promise<T>,
	maxRetries = 5,
	delay = 200
): Promise<T> {
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err: any) {
			if (err.code === "EBUSY" || err.message?.includes("EBUSY")) {
				console.warn(
					`[Auto Note Mover] Retry ${
						attempt + 1
					}/${maxRetries} due to EBUSY`
				);
				await new Promise((res) => setTimeout(res, delay));
			} else {
				throw err;
			}
		}
	}
	throw new Error("[Auto Note Mover] fileMove failed after maximum retries.");
}

export default class AutoNoteMover extends Plugin {
	settings: AutoNoteMoverSettings;

	async onload() {
		await this.loadSettings();
		const folderTagPattern = this.settings.folder_tag_pattern;
		const excludedFolder = this.settings.excluded_folder;

		const fileCheck = async (
			file: TAbstractFile,
			oldPath?: string,
			caller?: string
		) => {
			if (
				this.settings.trigger_auto_manual !== "Automatic" &&
				caller !== "cmd"
			) {
				return;
			}
			if (!(file instanceof TFile)) return;

			// The rename event with no basename change will be terminated.
			if (
				oldPath &&
				oldPath.split("/").pop() ===
					file.basename + "." + file.extension
			) {
				return;
			}

			// Excluded Folder check
			const excludedFolderLength = excludedFolder.length;
			for (let i = 0; i < excludedFolderLength; i++) {
				if (
					!this.settings.use_regex_to_check_for_excluded_folder &&
					excludedFolder[i].folder &&
					file.parent.path === normalizePath(excludedFolder[i].folder)
				) {
					return;
				} else if (
					this.settings.use_regex_to_check_for_excluded_folder &&
					excludedFolder[i].folder
				) {
					const regex = new RegExp(excludedFolder[i].folder);
					if (regex.test(file.parent.path)) {
						return;
					}
				}
			}

			const fileCache = this.app.metadataCache.getFileCache(file);
			// Disable AutoNoteMover when "AutoNoteMover: disable" is present in the frontmatter.
			if (isFmDisable(fileCache)) {
				return;
			}

			const fileName = file.basename;
			const fileFullName = file.basename + "." + file.extension;
			const settingsLength = folderTagPattern.length;
			const cacheTag = getAllTags(fileCache) ?? [];

			// checker
			for (let i = 0; i < settingsLength; i++) {
				const settingFolder = folderTagPattern[i].folder;
				const settingTag = folderTagPattern[i].tag;
				const settingPropertyKey =
					folderTagPattern[i].frontmatterPropertyKey;
				const settingPropertyValue =
					folderTagPattern[i].frontmatterPropertyValue;
				const settingPattern = folderTagPattern[i].pattern;
				const ruleType = folderTagPattern[i].ruleType;

				// Tag check
				if (ruleType === "tag" && settingTag) {
					if (!this.settings.use_regex_to_check_for_tags) {
						if (cacheTag.find((e) => e === settingTag)) {
							await retryWithDelay(() =>
								fileMove(
									this.app,
									settingFolder,
									fileFullName,
									file,
									this.settings.show_alerts,
									this.settings.auto_create_folders
								)
							);
							break;
						}
					} else if (this.settings.use_regex_to_check_for_tags) {
						const regex = new RegExp(settingTag);
						if (cacheTag.find((e) => regex.test(e))) {
							await retryWithDelay(() =>
								fileMove(
									this.app,
									settingFolder,
									fileFullName,
									file,
									this.settings.show_alerts,
									this.settings.auto_create_folders
								)
							);
							break;
						}
					}
					// Title check
				} else if (ruleType === "regex" && settingPattern) {
					const regex = new RegExp(settingPattern);
					const isMatch = regex.test(fileName);
					if (isMatch) {
						await retryWithDelay(() =>
							fileMove(
								this.app,
								settingFolder,
								fileFullName,
								file,
								this.settings.show_alerts,
								this.settings.auto_create_folders
							)
						);
						break;
					}
					// Property check
				} else if (
					ruleType === "property" &&
					settingPropertyKey &&
					settingPropertyValue &&
					fileCache?.frontmatter
				) {
					const fm = parseFrontMatterStringArray(
						fileCache.frontmatter,
						settingPropertyKey
					);
					if (
						fm &&
						fm.length > 0 &&
						fm.includes(settingPropertyValue)
					) {
						await retryWithDelay(() =>
							fileMove(
								this.app,
								settingFolder,
								fileFullName,
								file,
								this.settings.show_alerts,
								this.settings.auto_create_folders
							)
						);
						break;
					}
				}
			}
		};

		// Show trigger indicator on status bar
		let triggerIndicator: HTMLElement;
		const setIndicator = () => {
			if (!this.settings.statusBar_trigger_indicator) return;
			triggerIndicator.setText(
				getTriggerIndicator(this.settings.trigger_auto_manual)
			);
		};
		if (this.settings.statusBar_trigger_indicator) {
			triggerIndicator = this.addStatusBarItem();
			setIndicator();
			// TODO: Is there a better way?
			this.registerDomEvent(window, "change", setIndicator);
		}

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on(
					"create",
					async (file) => await fileCheck(file)
				)
			);
			this.registerEvent(
				this.app.metadataCache.on(
					"changed",
					async (file) => await fileCheck(file)
				)
			);
			this.registerEvent(
				this.app.vault.on(
					"rename",
					async (file, oldPath) => await fileCheck(file, oldPath)
				)
			);
		});

		const moveNoteCommand = (view: MarkdownView) => {
			if (isFmDisable(this.app.metadataCache.getFileCache(view.file))) {
				new Notice("Auto Note Mover is disabled in the frontmatter.");
				return;
			}
			fileCheck(view.file, undefined, "cmd");
		};

		const moveAllNotesCommand = () => {
			const files = this.app.vault.getMarkdownFiles();
			const filesLength = files.length;
			for (let i = 0; i < filesLength; i++) {
				fileCheck(files[i], undefined, "cmd");
			}
			new Notice(`All ${filesLength} notes have been moved.`);
		};

		this.addCommand({
			id: "Move-all-notes",
			name: "Move all notes",
			callback: () => {
				moveAllNotesCommand();
			},
		});

		this.addCommand({
			id: "Move-the-note",
			name: "Move the note",
			checkCallback: (checking: boolean) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						moveNoteCommand(markdownView);
					}
					return true;
				}
			},
		});

		this.addCommand({
			id: "Toggle-Auto-Manual",
			name: "Toggle Auto-Manual",
			callback: () => {
				if (this.settings.trigger_auto_manual === "Automatic") {
					this.settings.trigger_auto_manual = "Manual";
					this.saveData(this.settings);
					new Notice("[Auto Note Mover]\nTrigger is Manual.");
				} else if (this.settings.trigger_auto_manual === "Manual") {
					this.settings.trigger_auto_manual = "Automatic";
					this.saveData(this.settings);
					new Notice("[Auto Note Mover]\nTrigger is Automatic.");
				}
				setIndicator();
			},
		});

		this.addSettingTab(new AutoNoteMoverSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
