import AutoNoteMover from 'main';
import { App, Notice, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';

import { FolderSuggest } from 'suggests/file-suggest';
import { TagSuggest } from 'suggests/tag-suggest';
import { FrontmatterPropertySuggest, FrontmatterValueSuggest } from 'suggests/frontmatter-suggest';
import { arrayMove } from 'utils/Utils';

export interface FolderTagPattern {
	folder: string;
	tag: string;
	frontmatterPropertyKey: string;
	frontmatterPropertyValue: string;
	pattern: string;
}

export interface ExcludedFolder {
	folder: string;
}

export interface AutoNoteMoverSettings {
	trigger_auto_manual: string;
	use_regex_to_check_for_tags: boolean;
	statusBar_trigger_indicator: boolean;
	folder_tag_pattern: Array<FolderTagPattern>;
	use_regex_to_check_for_excluded_folder: boolean;
	excluded_folder: Array<ExcludedFolder>;
}

export const DEFAULT_SETTINGS: AutoNoteMoverSettings = {
	trigger_auto_manual: 'Automatic',
	use_regex_to_check_for_tags: false,
	statusBar_trigger_indicator: true,
	folder_tag_pattern: [{ folder: '', tag: '', frontmatterPropertyKey: '', frontmatterPropertyValue: '', pattern: '' }],
	use_regex_to_check_for_excluded_folder: false,
	excluded_folder: [{ folder: '' }],
};

export class AutoNoteMoverSettingTab extends PluginSettingTab {
	plugin: AutoNoteMover;

	constructor(app: App, plugin: AutoNoteMover) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		this.containerEl.empty();
		this.add_auto_note_mover_setting();
	}

	add_auto_note_mover_setting(): void {

		const descEl = document.createDocumentFragment();

		new Setting(this.containerEl)
			.setName('Trigger')
			.setDesc('Choose how the trigger will be activated.')
			.addDropdown((dropDown) =>
				dropDown
					.addOption('Automatic', 'Automatic')
					.addOption('Manual', 'Manual')
					.setValue(this.plugin.settings.trigger_auto_manual)
					.onChange((value: string) => {
						this.plugin.settings.trigger_auto_manual = value;
						this.plugin.saveData(this.plugin.settings);
						this.display();
					})
			);

		new Setting(this.containerEl)
			.setName('Use regular expressions to check for tags')
			.setDesc('If enabled, tags will be checked with regular expressions.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.use_regex_to_check_for_tags).onChange(async (value) => {
					this.plugin.settings.use_regex_to_check_for_tags = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(this.containerEl)
			.setName('Add new rule')
			.addButton((button: ButtonComponent) => {
				button
					.setTooltip('Add new rule')
					.setButtonText('+')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.folder_tag_pattern.push({
							folder: '',
							tag: '',
							frontmatterPropertyKey: '',
							frontmatterPropertyValue: '',
							pattern: '',
						});
						await this.plugin.saveSettings();
						this.display();
					});
			});

		this.plugin.settings.folder_tag_pattern.forEach((folder_tag_pattern, index) => {
			const settings = this.plugin.settings.folder_tag_pattern;
			const settingTag = settings.map((e) => e['tag']);
			const settingPattern = settings.map((e) => e['pattern']);
			const checkArr = (arr: string[], val: string) => {
				return arr.some((arrVal) => val === arrVal);
			};
			const checkKeyValuePair = (key: string, value: string) => {
				return settings.some((setting) => 
					setting.frontmatterPropertyKey === key && 
					setting.frontmatterPropertyValue === value
				);
			};

			const s = new Setting(this.containerEl)
				.addSearch((cb) => {
					new FolderSuggest(this.app, cb.inputEl);
					cb.setPlaceholder('Folder')
						.setValue(folder_tag_pattern.folder)
						.onChange(async (newFolder) => {
							this.plugin.settings.folder_tag_pattern[index].folder = newFolder.trim();
							await this.plugin.saveSettings();
						});
				})

				.addSearch((cb) => {
					new TagSuggest(this.app, cb.inputEl);
					cb.setPlaceholder('Tag')
						.setValue(folder_tag_pattern.tag)
						.onChange(async (newTag) => {
							if (this.plugin.settings.folder_tag_pattern[index].pattern) {
								this.display();
								return new Notice(`You can set either the tag or the title.`);
							}
							if (newTag && checkArr(settingTag, newTag)) {
								new Notice('This tag is already used.');
								return;
							}
							if (!this.plugin.settings.use_regex_to_check_for_tags) {
								this.plugin.settings.folder_tag_pattern[index].tag = newTag.trim();
							} else if (this.plugin.settings.use_regex_to_check_for_tags) {
								this.plugin.settings.folder_tag_pattern[index].tag = newTag;
							}
							await this.plugin.saveSettings();
						});
				})

				.addSearch((cb) => {
					new FrontmatterPropertySuggest(this.app, cb.inputEl);
					cb.setPlaceholder('Property Key')
						.setValue(folder_tag_pattern.frontmatterPropertyKey)
						.onChange(async (newFrontmatterPropertyKey) => {
							this.plugin.settings.folder_tag_pattern[index].frontmatterPropertyKey = newFrontmatterPropertyKey;
							await this.plugin.saveSettings();
						});
				})

				.addSearch((cb) => {
					const valueSuggest = new FrontmatterValueSuggest(this.app, cb.inputEl, folder_tag_pattern.frontmatterPropertyKey);
					cb.setPlaceholder('Property Value')
						.setValue(folder_tag_pattern.frontmatterPropertyValue)
						.onChange(async (newFrontmatterPropertyValue) => {
							if (newFrontmatterPropertyValue && 
								checkKeyValuePair(folder_tag_pattern.frontmatterPropertyKey, newFrontmatterPropertyValue)) {
								new Notice('This key-value combination is already used.');
								return;
							}

							this.plugin.settings.folder_tag_pattern[index].frontmatterPropertyValue = newFrontmatterPropertyValue;
							await this.plugin.saveSettings();
						});

					// Update value suggestions when property key changes
					const keyInput = this.containerEl.querySelector(`input[placeholder="Property Key"]`) as HTMLInputElement;
					if (keyInput) {
						keyInput.addEventListener('change', () => {
							valueSuggest.setPropertyName(keyInput.value);
						});
					}
				})

				.addSearch((cb) => {
					cb.setPlaceholder('Title by regex')
						.setValue(folder_tag_pattern.pattern)
						.onChange(async (newPattern) => {
							if (this.plugin.settings.folder_tag_pattern[index].tag) {
								this.display();
								return new Notice(`You can set either the tag or the title.`);
							}

							if (newPattern && checkArr(settingPattern, newPattern)) {
								new Notice('This pattern is already used.');
								return;
							}

							this.plugin.settings.folder_tag_pattern[index].pattern = newPattern;
							await this.plugin.saveSettings();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('up-chevron-glyph')
						.setTooltip('Move up')
						.onClick(async () => {
							arrayMove(this.plugin.settings.folder_tag_pattern, index, index - 1);
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('down-chevron-glyph')
						.setTooltip('Move down')
						.onClick(async () => {
							arrayMove(this.plugin.settings.folder_tag_pattern, index, index + 1);
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('cross')
						.setTooltip('Delete')
						.onClick(async () => {
							this.plugin.settings.folder_tag_pattern.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						});
				});
			s.infoEl.remove();
		});

		const useRegexToCheckForExcludedFolder = document.createDocumentFragment();
		useRegexToCheckForExcludedFolder.append(
			'If enabled, excluded folder will be checked with regular expressions.'
		);

		new Setting(this.containerEl)
			.setName('Use regular expressions to check for excluded folder')
			.setDesc(useRegexToCheckForExcludedFolder)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.use_regex_to_check_for_excluded_folder).onChange(async (value) => {
					this.plugin.settings.use_regex_to_check_for_excluded_folder = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(this.containerEl)
			.setName('Add Excluded Folder')
			.setDesc('Notes in the excluded folder will not be moved.')
			.addButton((button: ButtonComponent) => {
				button
					.setTooltip('Add Excluded Folders')
					.setButtonText('+')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.excluded_folder.push({
							folder: '',
						});
						await this.plugin.saveSettings();
						this.display();
					});
			});

		this.plugin.settings.excluded_folder.forEach((excluded_folder, index) => {
			const s = new Setting(this.containerEl)
				.addSearch((cb) => {
					new FolderSuggest(this.app, cb.inputEl);
					cb.setPlaceholder('Folder')
						.setValue(excluded_folder.folder)
						.onChange(async (newFolder) => {
							this.plugin.settings.excluded_folder[index].folder = newFolder;
							await this.plugin.saveSettings();
						});
				})

				.addExtraButton((cb) => {
					cb.setIcon('up-chevron-glyph')
						.setTooltip('Move up')
						.onClick(async () => {
							arrayMove(this.plugin.settings.excluded_folder, index, index - 1);
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('down-chevron-glyph')
						.setTooltip('Move down')
						.onClick(async () => {
							arrayMove(this.plugin.settings.excluded_folder, index, index + 1);
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addExtraButton((cb) => {
					cb.setIcon('cross')
						.setTooltip('Delete')
						.onClick(async () => {
							this.plugin.settings.excluded_folder.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						});
				});
			s.infoEl.remove();
		});

		const statusBarTriggerIndicatorDesc = document.createDocumentFragment();
		statusBarTriggerIndicatorDesc.append(
			'The status bar will display [A] if the trigger is Automatic, and [M] for Manual.',
		);
		new Setting(this.containerEl)
			.setName('Status Bar Trigger Indicator')
			.setDesc(statusBarTriggerIndicatorDesc)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.statusBar_trigger_indicator).onChange(async (value) => {
					this.plugin.settings.statusBar_trigger_indicator = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}
}
