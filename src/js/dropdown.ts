import { Widget } from "./widget";
import { createElement } from "./util";

export interface DropdownOption {
    label: string;
    value: string;
}

// in-theme replacement for <select> //
export class Dropdown extends Widget {
    private button: HTMLElement;
    private list: HTMLElement;
    private options: DropdownOption[] = [];
    private index: number = -1;
    private placeholder: string;

    constructor(className: string = "", placeholder: string = "Select...") {
        super(createElement("div", "dropdown " + className));
        this.createEvent("change");
        this.placeholder = placeholder;

        this.button = createElement("button", "dropdown-button");
        this.button.addEventListener("click", () => this.toggle());

        this.list = createElement("ul", "dropdown-list");
        this.list.style.display = "none";

        this.appendChild(this.button, this.list);

        this.container.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.close();
                e.stopPropagation();
            }
        });

        this.renderButton();
    }

    public setOptions(options: DropdownOption[], value: string = this.value): void {
        this.options = options.slice();
        this.index = this.options.findIndex(o => o.value === value);
        this.renderButton();
        if (this.isOpen) {
            this.renderList();
        }
    }

    public get value(): string {
        return this.index >= 0 ? this.options[this.index].value : "";
    }

    public set value(value: string) {
        this.index = this.options.findIndex(o => o.value === value);
        this.renderButton();
    }

    public get selectedIndex(): number {
        return this.index;
    }

    public set selectedIndex(index: number) {
        this.index = index >= 0 && index < this.options.length ? index : -1;
        this.renderButton();
    }

    public get length(): number {
        return this.options.length;
    }

    private get isOpen(): boolean {
        return this.list.style.display !== "none";
    }

    private toggle(): void {
        this.isOpen ? this.close() : this.open();
    }

    private onOutside = (e: MouseEvent) => {
        if (!this.container.contains(e.target as Node)) {
            this.close();
        }
    };

    private open(): void {
        document.addEventListener("mousedown", this.onOutside);
        this.renderList();
        this.list.style.display = "";
        this.container.classList.add("open");
        let selected = this.list.children[Math.max(this.index, 0)] as HTMLElement;
        selected && selected.scrollIntoView({ block: "nearest" });
    }

    private close(): void {
        document.removeEventListener("mousedown", this.onOutside);
        this.list.style.display = "none";
        this.container.classList.remove("open");
    }

    private renderButton(): void {
        this.button.innerText = this.index >= 0 ? this.options[this.index].label : this.placeholder;
    }

    private renderList(): void {
        this.list.innerHTML = "";
        this.options.forEach((option, i) => {
            let li = createElement("li", "dropdown-option" + (i === this.index ? " selected" : ""));
            li.innerText = option.label;
            li.addEventListener("click", () => {
                this.close();
                if (i !== this.index) {
                    this.index = i;
                    this.renderButton();
                    this.emitEvent("change", option.value);
                }
            });
            this.list.appendChild(li);
        });
    }
}
