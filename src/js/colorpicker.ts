import { Widget } from "./widget";
import { createElement } from "./util";

const swatches = [
    "#ffffff", "#b5bac1", "#4e5058", "#000000", "#ff4d4d", "#ff7a45", "#ffb020", "#ffc345",
    "#ffe14d", "#7dff6a", "#2ecc71", "#1abc9c", "#4dd9ff", "#3b82f6", "#5865f2", "#8b5cf6",
    "#c084fc", "#ff6ec7", "#eb459e", "#9a8d13",
];

function hexToHsv(hex: string): [number, number, number] {
    let n = parseInt(hex.slice(1), 16);
    let r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return [h, max ? d / max : 0, max];
}

function hsvToHex(h: number, s: number, v: number): string {
    let f = (n: number) => {
        let k = (n + h / 60) % 6;
        return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return "#" + [f(5), f(3), f(1)].map(c => c.toString(16).padStart(2, "0")).join("");
}

// tracks a pointer drag over an element, reporting 0..1 coordinates //
function dragOver(el: HTMLElement, onMove: (x: number, y: number) => void, onEnd: () => void): void {
    el.addEventListener("pointerdown", (e: PointerEvent) => {
        el.setPointerCapture(e.pointerId);
        let move = (e: PointerEvent) => {
            let r = el.getBoundingClientRect();
            onMove(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1));
        };
        let up = () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
            onEnd();
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        move(e);
    });
}

// in-theme replacement for <input type="color">: a swatch that opens a picker popover.
// fires "input" while you drag and "change" once you let go //
export class ColorPicker extends Widget {
    private popover: HTMLElement;
    private area: HTMLElement;
    private areaThumb: HTMLElement;
    private hue: HTMLElement;
    private hueThumb: HTMLElement;
    private hex: HTMLInputElement;
    private hsv: [number, number, number] = [0, 0, 1];
    private _value: string = "#ffffff";

    constructor(className: string = "") {
        super(createElement("button", "colorPicker " + className));
        this.createEvent("input");
        this.createEvent("change");

        this.popover = createElement("div", "colorPopover");
        this.popover.style.display = "none";
        this.popover.addEventListener("mousedown", e => e.stopPropagation());

        this.area = createElement("div", "colorPopover-area");
        this.areaThumb = createElement("div", "colorPopover-thumb");
        this.area.appendChild(this.areaThumb);
        dragOver(this.area, (x, y) => {
            this.hsv = [this.hsv[0], x, 1 - y];
            this.setFromHsv(true);
        }, () => this.emitEvent("change", this._value));

        this.hue = createElement("div", "colorPopover-hue");
        this.hueThumb = createElement("div", "colorPopover-thumb");
        this.hue.appendChild(this.hueThumb);
        dragOver(this.hue, (x) => {
            this.hsv = [x * 359.9, this.hsv[1], this.hsv[2]];
            this.setFromHsv(true);
        }, () => this.emitEvent("change", this._value));

        let swatchRow = createElement("div", "colorPopover-swatches");
        swatches.forEach(color => {
            let s = createElement("button", "colorPopover-swatch");
            s.style.backgroundColor = color;
            s.addEventListener("click", () => {
                this.setValue(color, true);
                this.emitEvent("change", this._value);
            });
            swatchRow.appendChild(s);
        });

        this.hex = createElement("input", "colorPopover-hex") as HTMLInputElement;
        this.hex.type = "text";
        this.hex.maxLength = 7;
        this.hex.addEventListener("keydown", e => {
            e.stopPropagation();
            if (e.key === "Enter" || e.key === "Escape") this.close();
        });
        this.hex.addEventListener("input", () => {
            let v = this.hex.value.trim();
            if (!v.startsWith("#")) v = "#" + v;
            if (/^#[0-9a-f]{6}$/i.test(v)) {
                this.setValue(v.toLowerCase(), true, false);
                this.emitEvent("change", this._value);
            }
        });

        this.popover.appendChild(this.area);
        this.popover.appendChild(this.hue);
        this.popover.appendChild(swatchRow);
        this.popover.appendChild(this.hex);

        this.container.addEventListener("click", () => this.isOpen ? this.close() : this.open());

        this.setValue(this._value, false);
    }

    public get value(): string {
        return this._value;
    }

    public set value(value: string) {
        this.setValue(value, false);
    }

    private get isOpen(): boolean {
        return this.popover.isConnected;
    }

    // only on the page (and listening) while open, so closed pickers cost nothing //
    private onOutside = (e: MouseEvent) => {
        if (!this.container.contains(e.target as Node)) this.close();
    };
    private onResize = () => this.close();

    private open(): void {
        document.body.appendChild(this.popover);
        document.addEventListener("mousedown", this.onOutside);
        window.addEventListener("resize", this.onResize);
        this.popover.style.display = "";
        // fixed to the viewport, so it never gets clipped by a scrolling menu //
        let r = this.container.getBoundingClientRect();
        let w = this.popover.offsetWidth, h = this.popover.offsetHeight;
        let vw = window.innerWidth || document.documentElement.clientWidth;
        let vh = window.innerHeight || document.documentElement.clientHeight;
        let left = Math.max(8, Math.min(r.right - w, vw - w - 8));
        let top = r.bottom + 6 + h > vh ? r.top - h - 6 : r.bottom + 6;
        this.popover.style.left = left + "px";
        this.popover.style.top = Math.max(8, top) + "px";
        this.renderThumbs();
    }

    private close(): void {
        this.popover.remove();
        document.removeEventListener("mousedown", this.onOutside);
        window.removeEventListener("resize", this.onResize);
    }

    private setValue(hex: string, emit: boolean, updateHexBox: boolean = true): void {
        this._value = hex;
        let [h, s, v] = hexToHsv(hex);
        // keep the hue where it was when the color has none (greys) //
        this.hsv = [s && v ? h : this.hsv[0], s, v];
        this.render(updateHexBox);
        emit && this.emitEvent("input", this._value);
    }

    private setFromHsv(emit: boolean): void {
        this._value = hsvToHex(this.hsv[0], this.hsv[1], this.hsv[2]);
        this.render(true);
        emit && this.emitEvent("input", this._value);
    }

    private render(updateHexBox: boolean): void {
        this.container.style.backgroundColor = this._value;
        updateHexBox && (this.hex.value = this._value);
        this.renderThumbs();
    }

    private renderThumbs(): void {
        this.area.style.backgroundColor = hsvToHex(this.hsv[0], 1, 1);
        this.areaThumb.style.left = this.hsv[1] * 100 + "%";
        this.areaThumb.style.top = (1 - this.hsv[2]) * 100 + "%";
        this.areaThumb.style.backgroundColor = this._value;
        this.hueThumb.style.left = this.hsv[0] / 360 * 100 + "%";
        this.hueThumb.style.backgroundColor = hsvToHex(this.hsv[0], 1, 1);
    }
}
