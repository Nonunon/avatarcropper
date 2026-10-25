import { Widget } from "./widget";
import { createElement } from "./util";

// a slider drawn from plain elements (no native range input), with its label sitting behind the thumb //
export class LabelSlider extends Widget {
    private labelElement: HTMLElement;
    private thumb: HTMLElement;
    private _value: number;

    constructor(private minValue: number, private maxValue: number, private step: number, label: string = "", className: string = "") {
        super(createElement("div", "labelSlider " + className));

        this.createEvent("slide");
        this.createEvent("change");

        this.labelElement = createElement("div", "labelSlider-label");
        this.labelElement.innerText = label;

        this.thumb = createElement("div", "labelSlider-thumb");

        this.container.tabIndex = 0;
        this.container.setAttribute("role", "slider");
        this.container.setAttribute("aria-label", label);
        this.container.setAttribute("aria-valuemin", String(minValue));
        this.container.setAttribute("aria-valuemax", String(maxValue));

        this.container.addEventListener("pointerdown", (e: PointerEvent) => {
            this.container.setPointerCapture(e.pointerId);
            let move = (e: PointerEvent) => this.setFromPointer(e.clientX);
            let up = () => {
                this.container.removeEventListener("pointermove", move);
                this.container.removeEventListener("pointerup", up);
                this.emitEvent("change", this._value);
            };
            this.container.addEventListener("pointermove", move);
            this.container.addEventListener("pointerup", up);
            move(e);
        });

        this.container.addEventListener("keydown", (e: KeyboardEvent) => {
            let delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
            if (delta) {
                e.preventDefault();
                e.stopPropagation();
                this.update(this._value + delta * this.step * (e.shiftKey ? 10 : 1));
                this.emitEvent("change", this._value);
            }
        });

        this.appendChild(this.labelElement, this.thumb);
        this.value = minValue;
    }

    public get value(): number {
        return this._value;
    }

    public set value(value: number) {
        this._value = this.clamp(value);
        this.renderThumb();
    }

    private clamp(value: number): number {
        let stepped = Math.round((value - this.minValue) / this.step) * this.step + this.minValue;
        // trim float noise from steps like 0.01 //
        stepped = parseFloat(stepped.toFixed(6));
        return Math.min(Math.max(stepped, this.minValue), this.maxValue);
    }

    private setFromPointer(clientX: number): void {
        let r = this.container.getBoundingClientRect();
        let thumb = this.thumb.offsetWidth;
        let ratio = (clientX - r.left - thumb / 2) / Math.max(r.width - thumb, 1);
        this.update(this.minValue + Math.min(Math.max(ratio, 0), 1) * (this.maxValue - this.minValue));
    }

    private update(value: number): void {
        let next = this.clamp(value);
        if (next !== this._value) {
            this._value = next;
            this.renderThumb();
            this.emitEvent("slide", this._value);
        }
    }

    private renderThumb(): void {
        let ratio = (this._value - this.minValue) / (this.maxValue - this.minValue || 1);
        this.thumb.style.left = "calc((100% - var(--thumb-size, 32px)) * " + ratio + ")";
        this.container.setAttribute("aria-valuenow", String(this._value));
    }
}
