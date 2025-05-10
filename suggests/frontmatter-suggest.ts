import { App, CachedMetadata, TFile } from 'obsidian';
import { TextInputSuggest } from './suggest';

// Class to collect all frontmatter properties from the vault
export class FrontmatterPropertyCollector {
    private app: App;
    private propertySet: Set<string>;
    private propertyMap: Map<string, string>; // Maps lowercase to original case

    constructor(app: App) {
        this.app = app;
        this.propertySet = new Set<string>();
        this.propertyMap = new Map<string, string>();
        this.collectProperties();
    }

    private collectProperties() {
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter) {
                Object.keys(cache.frontmatter).forEach(prop => {
                    const lowerProp = prop.toLowerCase();
                    this.propertySet.add(lowerProp);
                    // Keep the first occurrence of the property name with its original case
                    if (!this.propertyMap.has(lowerProp)) {
                        this.propertyMap.set(lowerProp, prop);
                    }
                });
            }
        });
    }

    pull(): string[] {
        return Array.from(this.propertySet).map(prop => this.propertyMap.get(prop) || prop);
    }
}

// Class to collect all values for a specific frontmatter property
export class FrontmatterValueCollector {
    private app: App;
    private propertyName: string;
    private valueSet: Set<string>;

    constructor(app: App, propertyName: string) {
        this.app = app;
        this.propertyName = propertyName;
        this.valueSet = new Set<string>();
        this.collectValues();
    }

    private collectValues() {
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter && cache.frontmatter[this.propertyName]) {
                const value = cache.frontmatter[this.propertyName];
                if (typeof value === 'string') {
                    this.valueSet.add(value);
                }
            }
        });
    }

    pull(): string[] {
        return Array.from(this.valueSet);
    }
}

// Suggestion class for frontmatter property names
export class FrontmatterPropertySuggest extends TextInputSuggest<string> {
    private propertyList: FrontmatterPropertyCollector;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.propertyList = new FrontmatterPropertyCollector(app);
    }

    getSuggestions(inputStr: string): string[] {
        const lowerCaseInputStr = inputStr.toLowerCase();
        return this.propertyList.pull().filter(prop => 
            prop.toLowerCase().contains(lowerCaseInputStr)
        );
    }

    renderSuggestion(property: string, el: HTMLElement): void {
        el.setText(property);
    }

    selectSuggestion(property: string): void {
        this.inputEl.value = property;
        this.inputEl.trigger('input');
        this.close();
    }
}

// Suggestion class for frontmatter property values
export class FrontmatterValueSuggest extends TextInputSuggest<string> {
    private propertyName: string;
    private valueList: FrontmatterValueCollector | null;

    constructor(app: App, inputEl: HTMLInputElement, propertyName: string) {
        super(app, inputEl);
        this.propertyName = propertyName;
        this.valueList = null;
        this.updateValueList();
    }

    setPropertyName(propertyName: string) {
        this.propertyName = propertyName;
        this.updateValueList();
    }

    private updateValueList() {
        if (this.propertyName) {
            this.valueList = new FrontmatterValueCollector(this.app, this.propertyName);
        } else {
            this.valueList = null;
        }
    }

    getSuggestions(inputStr: string): string[] {
        if (!this.valueList) {
            return [];
        }
        const lowerCaseInputStr = inputStr.toLowerCase();
        return this.valueList.pull().filter(value => 
            value.toLowerCase().contains(lowerCaseInputStr)
        );
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string): void {
        this.inputEl.value = value;
        this.inputEl.trigger('input');
        this.close();
    }
} 