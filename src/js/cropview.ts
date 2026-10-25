import { Widget } from "./widget";
import { createElement } from "./util";
import { Point } from "./point";
import { Renderer } from "./renderer";
import { KeyManager, Keys } from "./keymanager";
import { showAlert } from "./nativedialogs";
import { settings } from "./state";
import { isAnimated, canDecodeFrames, FramePlayer } from "./frames";
import { bannerArea } from "./compose";
import type { CropGeometry, Rect } from "./compose";
import {
    Crop, Bounds, Corner, defaultCrop, clampCrop, moveCrop, centerCrop, centerOf, hitTest, cornerAt,
    cornerPoint, resizeFromCorner, resizeFromCenter, roundCrop, rotateCrop, rotatedBounds,
} from "./crop";

type Drag =
    | { mode: "move", start: { x: number, y: number }, crop: Crop }
    | { mode: "resize", corner: Corner, offset: { x: number, y: number }, crop: Crop }
    | { mode: "pan", client: { x: number, y: number }, pan: { x: number, y: number } };

// the editor: one canvas that draws the image, the mask and the guides, and turns pointer input
// into crop changes. all crop math lives in crop.ts //
export class CropView extends Widget {
    public readonly image: HTMLImageElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private maskCanvas: HTMLCanvasElement;
    private renderer: Renderer;
    private player: FramePlayer | null = null;

    public currentFileType: string;
    public sourceFile: Blob;
    public sourceType: string;
    private _filename: string;

    private crop: Crop = { x: 0, y: 0, size: 1 };
    private currentRotation = 0;
    private flipX = false;
    private flipY = false;
    private zoomFactor = 1;
    private pan = { x: 0, y: 0 };
    private fitted = true;
    private drag: Drag | null = null;
    private loadingImage = false;
    private antialiased = true;
    private drawQueued = false;

    constructor() {
        super(createElement("div", "cropView"));

        this.createEvent("update");
        this.createEvent("imagechange");
        this.createEvent("antialiaschange");
        this.createEvent("frame");
        this.createEvent("actionstart");
        this.createEvent("actionend");

        this.image = <HTMLImageElement>createElement("img");
        this.canvas = <HTMLCanvasElement>createElement("canvas", "cropCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.maskCanvas = document.createElement("canvas");
        this.appendChild(this.canvas);

        this.renderer = new Renderer(this);
        document.body.appendChild(this.renderer.container);

        this.canvas.addEventListener("pointerdown", e => this.pointerDown(e));
        this.canvas.addEventListener("pointermove", e => this.pointerMove(e));
        this.canvas.addEventListener("pointerup", e => this.pointerUp(e));
        this.canvas.addEventListener("pointercancel", e => this.pointerUp(e));
        this.canvas.addEventListener("wheel", e => this.wheel(e), { passive: false });
        this.canvas.addEventListener("auxclick", e => e.preventDefault());

        // move the crop pixel by pixel with the arrow keys //
        window.addEventListener("keydown", e => {
            if (KeyManager.isArrowKey(e.keyCode) && this.hasImage) {
                this.setCrop(moveCrop(this.crop, KeyManager.axis(Keys.right, Keys.left), KeyManager.axis(Keys.down, Keys.up), this.bounds));
            }
        });

        new ResizeObserver(() => this.reactTMToRefresh()).observe(this.container);

        settings.subscribe(['maskOpacity', 'previewMode', 'outlinesEnabled', 'banneroutlinesEnabled', 'guidesEnabled'], () => this.update("settings"));
        this.antialias = settings.state.antialias;
    }

    // ---------- what everything else reads ---------- //

    public get hasImage(): boolean {
        return !!this.image.src && this.image.complete && this.image.naturalWidth > 0;
    }

    public get isAnimated(): boolean {
        return this.currentFileType === "gif";
    }

    // the current picture: the playing frame for animations, the image otherwise //
    public get source(): CanvasImageSource {
        return this.player ? this.player.canvas : this.image;
    }

    public get rotation(): number {
        return this.currentRotation;
    }

    private get bounds(): Bounds {
        return rotatedBounds(this.image.naturalWidth, this.image.naturalHeight, this.currentRotation);
    }

    public get cropArea(): Rect {
        return { x: this.crop.x, y: this.crop.y, width: this.crop.size, height: this.crop.size };
    }

    public get innerSize(): Point {
        return new Point(this.image.naturalWidth, this.image.naturalHeight);
    }

    public get geometry(): CropGeometry {
        let b = this.bounds;
        return {
            imageWidth: this.image.naturalWidth,
            imageHeight: this.image.naturalHeight,
            outerWidth: b.width,
            outerHeight: b.height,
            rotation: this.currentRotation,
            flipX: this.flipX,
            flipY: this.flipY,
            crop: this.cropArea,
        };
    }

    public get filename(): string {
        return this._filename;
    }

    public get src(): string {
        return this.image.src || null;
    }

    public set antialias(antialias: boolean) {
        this.antialiased = antialias;
        this.emitEvent("antialiaschange", antialias);
        this.update("antialias");
    }

    public get antialias(): boolean {
        return this.antialiased;
    }

    // ---------- changes ---------- //

    public update(source: string = ""): void {
        this.requestDraw();
        this.emitEvent("update", source);
    }

    private setCrop(crop: Crop): void {
        this.crop = crop;
        this.update("crop");
    }

    public centerCropArea(): void {
        this.setCrop(roundCrop(centerCrop(this.crop, this.bounds)));
    }

    public setCropSize(size: number): void {
        let center = centerOf(this.crop);
        this.setCrop(roundCrop(clampCrop({ x: center.x - size / 2, y: center.y - size / 2, size }, this.bounds), true));
    }

    public rotate(deg: number = this.currentRotation): void {
        let from = this.bounds;
        let delta = deg - this.currentRotation;
        this.currentRotation = deg;
        this.crop = roundCrop(rotateCrop(this.crop, from, this.bounds, delta), true);
        this.refit();
        this.update("rotate");
    }

    // flipping the view is a mirror of everything on screen: the image flips, the rotation runs the
    // other way, and the crop lands on the mirrored spot //
    public flipHorizontal(): void {
        this.flipX = !this.flipX;
        this.mirror(true);
    }

    public flipVertical(): void {
        this.flipY = !this.flipY;
        this.mirror(false);
    }

    private mirror(horizontal: boolean): void {
        let b = this.bounds;
        this.currentRotation = -this.currentRotation;
        let mirrored = horizontal
            ? { x: b.width - this.crop.x - this.crop.size, y: this.crop.y, size: this.crop.size }
            : { x: this.crop.x, y: b.height - this.crop.y - this.crop.size, size: this.crop.size };
        this.crop = roundCrop(clampCrop(mirrored, b));
        this.update("flip");
    }

    public renderCroppedImage(): void {
        this.renderer.render();
    }

    // ---------- zoom and pan ---------- //

    public zoomIn(): void {
        let r = this.canvas.getBoundingClientRect();
        this.zoomAt(1.1, r.width / 2, r.height / 2);
    }

    public zoomOut(): void {
        let r = this.canvas.getBoundingClientRect();
        this.zoomAt(1 / 1.1, r.width / 2, r.height / 2);
    }

    // zooms by `factor`, keeping the point under (sx, sy) where it is //
    private zoomAt(factor: number, sx: number, sy: number): void {
        let next = Math.min(Math.max(this.zoomFactor * factor, 0.02), 64);
        let ox = (sx - this.pan.x) / this.zoomFactor, oy = (sy - this.pan.y) / this.zoomFactor;
        this.zoomFactor = next;
        this.pan = { x: sx - ox * next, y: sy - oy * next };
        this.fitted = false;
        this.update("zoom");
    }

    public zoomFit(): void {
        this.fitted = true;
        this.refit();
        this.update("zoom");
    }

    private refit(): void {
        if (!this.fitted || !this.hasImage) {
            return;
        }
        let r = this.container.getBoundingClientRect();
        let b = this.bounds;
        this.zoomFactor = Math.min(r.width / b.width, r.height / b.height) || 1;
        this.pan = { x: 0, y: 0 };
    }

    // called when the window or layout changes size //
    public reactTMToRefresh(): void {
        this.refit();
        this.requestDraw();
    }

    // ---------- pointer input ---------- //

    private toOuter(e: MouseEvent): { x: number, y: number } {
        let r = this.canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - this.pan.x) / this.zoomFactor, y: (e.clientY - r.top - this.pan.y) / this.zoomFactor };
    }

    private pointerDown(e: PointerEvent): void {
        if (!this.hasImage || (e.button !== 0 && e.button !== 1)) {
            return;
        }
        e.preventDefault();
        let p = this.toOuter(e);
        let hit = e.button === 1 ? "none" : hitTest(this.crop, p.x, p.y);

        if (hit === "move") {
            this.drag = { mode: "move", start: p, crop: this.crop };
        } else if (hit === "resize") {
            let corner = cornerAt(this.crop, p.x, p.y);
            let point = cornerPoint(this.crop, corner);
            this.drag = { mode: "resize", corner, offset: { x: point.x - p.x, y: point.y - p.y }, crop: this.crop };
        } else {
            // dragging outside the crop (or with the middle button) pans the view //
            this.drag = { mode: "pan", client: { x: e.clientX, y: e.clientY }, pan: { ...this.pan } };
            this.canvas.style.cursor = "grabbing";
        }

        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch {
            // synthetic or already-ended pointers can't be captured; the drag still works //
        }
        this.emitEvent("actionstart");
    }

    private pointerMove(e: PointerEvent): void {
        if (!this.hasImage) {
            return;
        }
        let p = this.toOuter(e);

        if (!this.drag) {
            let hit = hitTest(this.crop, p.x, p.y);
            let corner = cornerAt(this.crop, p.x, p.y);
            this.canvas.style.cursor = hit === "move" ? "move"
                : hit === "resize" ? (corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize")
                : "grab";
            return;
        }

        let lock = settings.state.resizeLock;
        let drag = this.drag;
        if (drag.mode === "move") {
            this.setCrop(roundCrop(moveCrop(drag.crop, p.x - drag.start.x, p.y - drag.start.y, this.bounds)));
        } else if (drag.mode === "resize") {
            let x = p.x + drag.offset.x, y = p.y + drag.offset.y;
            let next = lock ? resizeFromCenter(drag.crop, x, y, this.bounds) : resizeFromCorner(drag.crop, drag.corner, x, y, this.bounds);
            this.setCrop(roundCrop(next, lock));
        } else {
            this.pan = { x: drag.pan.x + e.clientX - drag.client.x, y: drag.pan.y + e.clientY - drag.client.y };
            this.fitted = false;
            this.requestDraw();
        }
    }

    private pointerUp(e: PointerEvent): void {
        if (!this.drag) {
            return;
        }
        this.drag = null;
        this.canvas.hasPointerCapture(e.pointerId) && this.canvas.releasePointerCapture(e.pointerId);
        this.pointerMove(e);
        this.emitEvent("actionend");
    }

    private wheel(e: WheelEvent): void {
        if (!this.hasImage) {
            return;
        }
        e.preventDefault();
        let r = this.canvas.getBoundingClientRect();
        this.zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top);
    }

    // ---------- loading ---------- //

    public setImageFromFile(file: File): boolean {
        // some sources hand over files with no mime type, so fall back to the extension //
        let ext = file ? file.name.split('.').pop().toLowerCase() : "";
        let looksLikeImage = file && (file.type.startsWith("image/") || (!file.type && /^(png|jpe?g|jfif|gif|webp|avif|bmp|ico|svg|apng)$/.test(ext)));
        if (!looksLikeImage || this.loadingImage) {
            return false;
        }

        let types: { [ext: string]: string } = { gif: "image/gif", webp: "image/webp", png: "image/png", apng: "image/apng", avif: "image/avif" };
        let type = file.type || types[ext] || "";
        this.loadingImage = true;

        // anything animated (gif, webp, apng, avif) is cropped frame by frame //
        let animatedCheck = type === "image/gif" && !canDecodeFrames() ? Promise.resolve(true) : isAnimated(file, type);

        animatedCheck.then(async animated => {
            let url = URL.createObjectURL(file);
            let img = new Image();
            try {
                img.src = url;
                await img.decode();
            } catch {
                URL.revokeObjectURL(url);
                this.loadingImage = false;
                showAlert("Couldn't open " + file.name + ", your browser can't read that image format.");
                return;
            }

            let player = animated ? await FramePlayer.open(file, type, () => this.frame()) : null;

            if (this.image.src) {
                URL.revokeObjectURL(this.image.src);
            }
            this.player && this.player.close();

            this.sourceFile = file;
            this.sourceType = type;
            this.currentFileType = animated ? "gif" : "png";
            let base = file.name.lastIndexOf('.') > 0 ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
            this._filename = base + "_cropped." + this.currentFileType;

            this.image.src = url;
            await this.image.decode().catch(() => { });
            this.player = player;
            this.currentRotation = 0;
            this.flipX = this.flipY = false;
            this.crop = roundCrop(defaultCrop(this.bounds));
            this.fitted = true;
            this.refit();
            player && player.start();

            this.loadingImage = false;
            this.emitEvent("imagechange", url);
            this.update("image change");
        });
        return true;
    }

    // a new animation frame: redraw here and let the previews know //
    private frame(): void {
        this.requestDraw();
        this.emitEvent("frame");
    }

    // ---------- drawing ---------- //

    private requestDraw(): void {
        if (this.drawQueued) {
            return;
        }
        this.drawQueued = true;
        requestAnimationFrame(() => {
            this.drawQueued = false;
            this.draw();
        });
    }

    private draw(): void {
        let dpr = window.devicePixelRatio || 1;
        let r = this.container.getBoundingClientRect();
        let w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = this.maskCanvas.width = w;
            this.canvas.height = this.maskCanvas.height = h;
        }

        let ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (!this.hasImage) {
            return;
        }

        let s = settings.state;
        let geo = this.geometry;
        let z = this.zoomFactor;
        let view = (c: CanvasRenderingContext2D) => c.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.pan.x, dpr * this.pan.y);

        // the image //
        view(ctx);
        ctx.imageSmoothingEnabled = this.antialiased;
        ctx.save();
        ctx.translate(geo.outerWidth / 2, geo.outerHeight / 2);
        ctx.rotate(geo.rotation / 180 * Math.PI);
        ctx.scale(this.flipX ? -1 : 1, this.flipY ? -1 : 1);
        ctx.drawImage(this.source, -geo.imageWidth / 2, -geo.imageHeight / 2, geo.imageWidth, geo.imageHeight);
        ctx.restore();

        let c = this.crop;
        let center = centerOf(c);
        let circle = s.previewMode !== "square";

        // the mask darkens everything outside the crop (and the banner, when it's on) //
        if (s.maskOpacity > 0) {
            let m = this.maskCanvas.getContext("2d");
            m.setTransform(1, 0, 0, 1, 0, 0);
            m.clearRect(0, 0, w, h);
            view(m);
            m.fillStyle = "rgba(0,0,0," + s.maskOpacity + ")";
            m.fillRect(0, 0, geo.outerWidth, geo.outerHeight);
            m.globalCompositeOperation = "destination-out";
            // the cut-out has to be fully opaque or it only removes part of the mask //
            m.fillStyle = "#000";
            m.beginPath();
            if (circle) {
                m.arc(center.x, center.y, c.size / 2, 0, Math.PI * 2);
            } else {
                m.rect(c.x, c.y, c.size, c.size);
            }
            m.fill();
            if (s.banneroutlinesEnabled) {
                let b = bannerArea(geo.crop);
                m.fillRect(b.x, b.y, b.width, b.height);
            }
            m.globalCompositeOperation = "source-over";
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(this.maskCanvas, 0, 0);
            view(ctx);
        }

        // lines are sized in screen pixels, whatever the zoom //
        let line = 1.5 / z;
        let dash = [6 / z];
        ctx.lineWidth = line;

        if (s.outlinesEnabled) {
            ctx.setLineDash(dash);
            ctx.strokeStyle = "white";
            if (circle) {
                ctx.beginPath();
                ctx.arc(center.x, center.y, c.size / 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.strokeRect(c.x - line / 2, c.y - line / 2, c.size + line, c.size + line);
        }

        if (s.banneroutlinesEnabled) {
            // Discord's profile layout: the banner above, with the avatar cut into its bottom-left //
            let left = c.x - (c.size / 5 + c.size / 13.33);
            let right = c.x + c.size + c.size * 2.4 + c.size / 13.33;
            let top = center.y - c.size * 1.5;
            ctx.setLineDash(dash);
            ctx.beginPath();
            ctx.moveTo(left, center.y);
            ctx.lineTo(c.x, center.y);
            ctx.arc(center.x, center.y, c.size / 2, Math.PI, 2 * Math.PI, false);
            ctx.lineTo(right, center.y);
            ctx.lineTo(right, top);
            ctx.lineTo(left, top);
            ctx.lineTo(left, center.y);
            ctx.strokeStyle = "yellow";
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(center.x, center.y, c.size / 2 + c.size / 13.33, Math.PI, 2 * Math.PI, false);
            ctx.strokeStyle = "red";
            ctx.stroke();
        }

        if (s.guidesEnabled) {
            ctx.setLineDash(dash);
            ctx.lineDashOffset = dash[0];
            ctx.strokeStyle = "yellow";
            ctx.beginPath();
            ctx.moveTo(center.x, c.y);
            ctx.lineTo(center.x, c.y + c.size);
            ctx.moveTo(c.x, center.y);
            ctx.lineTo(c.x + c.size, center.y);
            ctx.stroke();
            ctx.lineDashOffset = 0;
        }

        ctx.setLineDash([]);
    }
}
