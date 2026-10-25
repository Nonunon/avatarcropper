import { Widget } from "./widget";
import { createElement, showElement, hideElement } from "./util";
import { CropView } from "./cropview";
import { Point } from "./point";
import { compose } from "./compose";
import { settings, borderKeys } from "./state";

// a live, true-size look at the crop, drawn by the same compositor the export uses //
export class Preview extends Widget {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private bottomBar: HTMLElement;
    private _size: Point;
    private cropView: CropView;
    private queued: boolean = false;
    private removed: boolean = false;

    constructor(size: Point, cropView: CropView) {
        super(createElement("div", "preview"));

        this.createEvent("requestremove");

        this._size = size;
        this.cropView = cropView;

        this.container.style.width = size.x + "px";
        this.container.style.height = size.y + "px";

        // drawn at device resolution so it stays crisp on scaled displays //
        let dpr = window.devicePixelRatio || 1;
        this.canvas = createElement("canvas", "previewCanvas") as HTMLCanvasElement;
        this.canvas.width = Math.round(size.x * dpr);
        this.canvas.height = Math.round(size.y * dpr);
        this.canvas.style.width = size.x + "px";
        this.canvas.style.height = size.y + "px";
        this.context = this.canvas.getContext("2d");

        this.appendChild(this.canvas);

        if (size.equals(new Point(30))) {
            this.appendChild(createElement("div", "onlineIndicator"));
        }

        this.bottomBar = createElement("div", "bottomBar");
        let sizeDisplay = createElement("div", "size");
        sizeDisplay.innerText = size.x + "x" + size.y;
        this.container.title = sizeDisplay.innerText;
        let removeButton = createElement("button", "remove");
        removeButton.innerText = "✖";
        removeButton.addEventListener("click", () => this.emitEvent("requestremove"));
        this.bottomBar.appendChild(sizeDisplay);
        this.bottomBar.appendChild(removeButton);
        this.appendChild(this.bottomBar);
        hideElement(this.bottomBar);
        this.container.addEventListener("mouseenter", () => showElement(this.bottomBar));
        this.container.addEventListener("mouseleave", () => hideElement(this.bottomBar));

        cropView.on("update", () => this.queue());
        cropView.on("imagechange", () => this.queue());
        cropView.on("antialiaschange", () => this.queue());
        // animations: the crop view plays them and says when a new frame is up //
        cropView.on("frame", () => this.queue());
        settings.subscribe([...borderKeys, "previewMode"], () => this.queue());

        this.queue();
    }

    public get size(): Point {
        return this._size;
    }

    public destroy(): void {
        this.removed = true;
    }

    private queue(): void {
        if (!this.queued && !this.removed) {
            this.queued = true;
            requestAnimationFrame(() => {
                this.queued = false;
                this.draw();
            });
        }
    }

    public draw(): void {
        if (!this.container.isConnected) {
            return;
        }
        if (!this.cropView.hasImage) {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        compose(this.context, this.cropView.source, this.cropView.geometry, this.canvas.width, this.canvas.height, {
            shape: settings.state.previewMode === "square" ? "square" : "circle",
            smooth: this.cropView.antialias,
        });
    }
}
