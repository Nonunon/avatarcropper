import { createElement, makePixelated } from "./util";
import { Canvas } from "./canvas";
import { settings } from "./state";
import { Renderer } from "./renderer";
import { Point } from "./point";
import { Rectangle, RectAnchor } from "./rectangle";
import { KeyManager, Keys } from "./keymanager";
import { Drawer } from "./drawer";
import { showAlert } from "./nativedialogs";
import { isAnimated, canDecodeFrames } from "./frames";
import type { CropGeometry } from "./compose";

type MouseAction = "move" | "resize" | "new" | "none";

class Circle extends Rectangle {
    private cropView: CropView;
    private _origin: Rectangle;

    constructor(cropView: CropView) {
        super(new Point(), new Point());
        this.cropView = cropView;
        this.saveOrigin();
    }

    public get radius(): Point {
        return this.size.dividedBy(2);
    }

    public set radius(radius: Point) {
        this.size = radius.times(2);
    }

    public reset(): void {
        this.position = new Point(0);
        this.size = new Point(this.cropView.outerRect.size.min / 2);
    }

    public get rectangle(): Rectangle {
        return this.copy();
    }

    public saveOrigin(): void {
        this._origin = this.copy();
    }

    public get origin(): Rectangle {
        return this._origin;
    }

    public validate(): number {
        let ret = 0b00000000;

        if (this.width > this.cropView.outerSize.x) {
            this.setWidthKeepAR(this.cropView.outerSize.x);
            ret |= 1;
        }

        if (this.height > this.cropView.outerSize.y) {
            this.setHeightKeepAR(this.cropView.outerSize.y);
            ret |= 2;
        }

        if (this.x < 0) {
            this.x = 0;
            ret |= 4;
        }

        if (this.y < 0) {
            this.y = 0;
            ret |= 8;
        }

        if (this.bottom > this.cropView.outerSize.y) {
            this.bottom = this.cropView.outerSize.y;
            ret |= 16;
        }

        if (this.right > this.cropView.outerSize.x) {
            this.right = this.cropView.outerSize.x;
            ret |= 32;
        }

        return ret;
    }
}

export class CropView extends Drawer {
    public readonly image: HTMLImageElement;
    public readonly overlay: Canvas;
    private _isZoomFitted: boolean = false;
    private _zoomFactor: number = 1;
    private currentRotation = 0;
    public currentFileType: string;
    public sourceFile: Blob;
    public sourceType: string;
    public circle: Circle;
    private _filename: string;
    private currentAction: MouseAction = "none";
    private mouseOrigin: Point;
    private resizeAnchor: Point;
    private resizeOffset: Point;
    private readonly renderer: Renderer;
    private loadingImage: boolean = false;
    private antialiased: boolean;

    constructor() {
        super(createElement("div", "cropView"));

        this.createEvent("update");
        this.createEvent("imagechange");
        this.createEvent("antialiaschange");
        this.createEvent("actionstart");
        this.createEvent("actionend");

        this.circle = new Circle(this);
        this.renderer = new Renderer(this);

        this.image = <HTMLImageElement>createElement("img", "image");
        this.image.style.transformOrigin = "top left";

        this.overlay = new Canvas({
            deepCalc: true
        });

        this.appendChild(this.image, this.overlay.canvas);

        document.body.appendChild(this.renderer.container);

        this.overlay.addEventListener("mousemove", this.mouseMove.bind(this));
        this.overlay.addEventListener("mousedown", this.mouseDown.bind(this));

        this.overlay.canvas.addEventListener("touchmove", (e) => {
            if (!(this.currentAction === "new" || this.currentAction === "none")) {
                e.preventDefault();
            }
        });

        document.body.addEventListener("mouseup", () => {
            let ca = this.currentAction;
            this.currentAction = "none";
            if (ca !== "none") {
                this.update("mouseup");
                this.emitEvent("actionend");
            }
        });

        document.body.addEventListener("touchend", () => {
            let ca = this.currentAction;
            this.currentAction = "none";
            if (ca !== "none") {
                this.update("touchend");
                this.emitEvent("actionend");
            }
        });

        // move circle around with arrow keys //
        window.addEventListener("keydown", e => this.handleKeypress(e.keyCode));

        this.antialias = settings.state.antialias;

        settings.subscribe(['maskOpacity', 'previewMode', 'outlinesEnabled', 'banneroutlinesEnabled', 'guidesEnabled'], () => this.update("settings"));
    }

    private handleKeypress(key: number) {
        if (KeyManager.isArrowKey(key)) {
            this.circle.x += KeyManager.axis(Keys.right, Keys.left);
            this.circle.y += KeyManager.axis(Keys.down, Keys.up);
            this.circle.validate();
            this.update("ketypress");
        }
    }

    public get rotation(): number {
        return this.currentRotation;
    }

    // a plain snapshot of everything the compositor needs //
    public get geometry(): CropGeometry {
        return {
            imageWidth: this.image.width,
            imageHeight: this.image.height,
            outerWidth: this.overlay.width,
            outerHeight: this.overlay.height,
            rotation: this.currentRotation,
            crop: { x: this.circle.x, y: this.circle.y, width: this.circle.width, height: this.circle.height },
        };
    }

    public get hasImage(): boolean {
        return !!this.image.src && this.image.complete && this.image.naturalWidth > 0;
    }

    public get isAnimated(): boolean {
        return this.currentFileType === "gif";
    }

    public get cropArea(): Rectangle {
        return this.circle.rectangle;
    }

    public get zoomFactor(): number {
        return this._zoomFactor;
    }

    public update(source: string) {
        super.update(source);
        this.emitEvent("update", source);
    }

    public reactTMToRefresh() {
        this.isZoomFitted && this.zoomFit();
    }

    protected draw(): void {
        // draw mask //
        if (settings.state.maskOpacity !== 1) {
            this.overlay.clear();
        }

        if (settings.state.maskOpacity !== 0) {
            this.overlay.fill("rgba(0,0,0," + settings.state.maskOpacity + ")");

            this.overlay.blendMode = "destination-out";
            if (settings.state.previewMode === "circle") {
                this.overlay.fillCircleInRect(this.circle, "white");
            }
            else {
                this.overlay.fillRect(this.circle, "white");
            }
            if (settings.state.banneroutlinesEnabled) {
                this.overlay.fillRect(
                    new Rectangle(new Point(this.circle.left - (this.circle.width / 5 + this.circle.width / 13.33), this.circle.cy - (this.circle.width * 1.5)), new Point(this.circle.width * 3.75, this.circle.width * 1.5)),
                    "white"
                )
            }
        }

        this.overlay.blendMode = "source-over";
        let lineWidth = ~~(1 / this.zoomFactor) + 1;

        if (settings.state.outlinesEnabled) {
            let sharp = lineWidth % 2 === 1;

            this.overlay.lineDash = [Math.min(this.overlay.width, this.overlay.height) / 100];

            if (settings.state.previewMode === "circle") {
                this.overlay.drawCircleInRect(this.circle, "white", lineWidth);
            }

            this.overlay.drawRect(
                new Rectangle(
                    this.circle.position.minus(lineWidth),
                    this.circle.size.plus(lineWidth)
                ),
                "white",
                lineWidth,
                sharp
            );
        }

        if (settings.state.banneroutlinesEnabled) {
            this.overlay.lineDash = [Math.min(this.overlay.width, this.overlay.height) / 100];


            
            
        this.overlay.context.beginPath()
        this.overlay.context.moveTo(this.circle.left - (this.circle.width / 5 + this.circle.width / 13.33), this.circle.cy)
        this.overlay.context.lineTo(this.circle.left, this.circle.cy)
        this.overlay.context.arc(this.circle.center.x, this.circle.center.y, this.circle.width / 2, Math.PI, 1.5 * Math.PI, false)
        this.overlay.context.arc(this.circle.center.x, this.circle.center.y, this.circle.width / 2, 1.5 * Math.PI, 2 * Math.PI, false)
        this.overlay.context.lineTo(this.circle.right + (this.circle.width * 2.4) + (this.circle.width / 13.33), this.circle.cy)
        this.overlay.context.lineTo(this.circle.right + (this.circle.width * 2.4) + (this.circle.width / 13.33), this.circle.cy - (this.circle.width * 1.5))
        this.overlay.context.lineTo(this.circle.left - (this.circle.width / 5 + this.circle.width / 13.33), this.circle.cy - (this.circle.width * 1.5))
        this.overlay.context.lineTo(this.circle.left - (this.circle.width / 5 + this.circle.width / 13.33), this.circle.cy)
        this.overlay.context.lineWidth = lineWidth
        this.overlay.context.strokeStyle = "yellow"
        this.overlay.context.stroke()

        this.overlay.context.beginPath()
        this.overlay.context.moveTo(this.circle.left - (this.circle.width / 13.33), this.circle.cy)
        this.overlay.context.arc(this.circle.center.x, this.circle.center.y, this.circle.width / 2 + (this.circle.width / 13.33), Math.PI, 1.5 * Math.PI, false)
        this.overlay.context.arc(this.circle.center.x, this.circle.center.y, this.circle.width / 2 + (this.circle.width / 13.33), 1.5 * Math.PI, 2 * Math.PI, false)
        this.overlay.context.strokeStyle = "red"
        this.overlay.context.stroke()
        }

        if (settings.state.guidesEnabled) {
            this.overlay.context.lineDashOffset = this.overlay.context.getLineDash()[0];
            this.overlay.drawLine(this.circle.center, new Point(this.circle.cx, this.circle.bottom), "yellow", lineWidth);
            this.overlay.drawLine(this.circle.center, new Point(this.circle.cx, this.circle.top), "yellow", lineWidth);
            this.overlay.drawLine(this.circle.center, new Point(this.circle.right, this.circle.cy), "yellow", lineWidth);
            this.overlay.drawLine(this.circle.center, new Point(this.circle.left, this.circle.cy), "yellow", lineWidth);
            this.overlay.context.lineDashOffset = 0;
        }

    }

    // returns size of image (internal res of image) //
    public get innerRect(): Rectangle {
        return new Rectangle(new Point(0), this.innerSize);
    }

    public get innerSize() : Point {
        return new Point(this.image.width, this.image.height);
    }

    // returns sizes taking rotation into consideration (internal res of overlay) //
    public get outerRect(): Rectangle {
        return new Rectangle(new Point(0), this.outerSize);
    }

    public get outerSize() : Point {
        return new Point(this.overlay.width, this.overlay.height);
    }

    public get apparentSize() : Point {
        return Point.fromSizeLike(this.container.getBoundingClientRect());
    }

    private get isZoomFitted(): boolean {
        return this._isZoomFitted;
    }

    private set isZoomFitted(z: boolean) {
        this._isZoomFitted = z;

        if (z) {
            this.container.style.overflow = "hidden";
        }
        else {
            this.container.style.overflow = "";
        }
    }

    public zoom(factor?: number, shouldUpdate: boolean = true): void {
        let ogScrollTopP = this.container.scrollTop / this.container.scrollHeight;
        let ogScrollLeftP = this.container.scrollLeft / this.container.scrollWidth;

        this.container.scrollTop = 0;
        this.container.scrollLeft = 0;
        let rotatePart = "";

        if (this.image.style.transform.indexOf(" rotate") !== -1) {
            rotatePart = this.image.style.transform.substr(
                this.image.style.transform.indexOf(" rotate")
            );
        }

        factor = factor || this.zoomFactor;
        this._zoomFactor = factor;
        this.overlay.zoom(factor);
        this.image.style.transform = "scale(" + factor + "," + factor + ")";

        this.image.style.transform += rotatePart;

        let r = this.image.getBoundingClientRect();

        if (r.left !== 0) {
            let current = parseFloat(this.image.style.left || "0px");
            current -= r.left;

            this.image.style.left = current + "px";
        }

        if (r.top !== 0) {
            let current = parseFloat(this.image.style.top || "0px");
            current -= r.top;

            this.image.style.top = current + "px";
        }

        shouldUpdate && this.update("zoom");

        this.container.scrollTop = ogScrollTopP * this.container.scrollHeight;
        this.container.scrollLeft = ogScrollLeftP * this.container.scrollWidth;
    }

    public zoomIn(): void {
        this.isZoomFitted = false;
        this.zoom(this.zoomFactor * 1.1);
    }

    public zoomOut(): void {
        this.isZoomFitted = false;
        this.zoom(this.zoomFactor / 1.1);
    }

    public zoomFit(force: boolean = true, shouldUpdate: boolean = true): void {
        if (!this.image) {
            return;
        }

        if (!this.isZoomFitted && !force) {
            return;
        }

        this.isZoomFitted = true;


        var cr = this.container.getBoundingClientRect();
        var ir = { width: this.overlay.width, height: this.overlay.height };

        var fw = cr.width / ir.width;
        var fh = cr.height / ir.height;
        var f = Math.min(fw, fh);


        this.zoom(f, shouldUpdate);
    }

    public rotate(deg?: number, shouldUpdate: boolean = true): void {
        if (deg === undefined) deg = this.currentRotation;

        this.currentRotation = deg;

        if (this.image.style.transform.indexOf(" rotate") !== -1) {
            this.image.style.transform = this.image.style.transform.substr(
                0,
                this.image.style.transform.indexOf(" rotate")
            );
        }

        let b4 = this.image.style.transform;

        this.image.style.left = "0px";
        this.image.style.top = "0px";

        let size = Point.fromSizeLike(this.image);

        let or = Point.fromSizeLike(this.image.getBoundingClientRect());

        this.image.style.transform = b4 + " rotate(" + deg + "deg)";

        let r = Rectangle.fromClientRect(this.image.getBoundingClientRect());
        let delta = r.topLeft.inverted.minus(new Point(this.container.scrollLeft, this.container.scrollTop));

        this.image.style.left = delta.x + "px";
        this.image.style.top = delta.y + "px";

        size.multiply(r.size.dividedBy(or));
        this.overlay.resize(size, false);


        this.zoomFit(false, shouldUpdate);
        this.circle.validate();
        shouldUpdate && this.update("rotate");
    }

    public set antialias(antialias: boolean) {
        makePixelated(this.image, !antialias);
        this.overlay.pixelated = !antialias;

        this.antialiased = antialias;
        this.emitEvent("antialiaschange", this.antialiased);
    }

    public get antialias(): boolean {
        return this.antialiased;
    }

    public setImageFromFile(file: File): boolean {
        // some sources hand over files with no mime type, so fall back to the extension //
        let ext = file ? file.name.split('.').pop().toLowerCase() : "";
        let looksLikeImage = file && (file.type.startsWith("image/") || (!file.type && /^(png|jpe?g|jfif|gif|webp|avif|bmp|ico|svg|apng)$/.test(ext)));
        if (!looksLikeImage || this.loadingImage) {
            return false;
        }

        let types: { [ext: string]: string } = { gif: "image/gif", webp: "image/webp", png: "image/png", apng: "image/apng", avif: "image/avif" };
        this.sourceFile = file;
        this.sourceType = file.type || types[ext] || "";

        this.loadingImage = true;

        // anything animated (gif, webp, apng, avif) is cropped frame by frame and saved as a gif //
        let animatedCheck = this.sourceType === "image/gif" && !canDecodeFrames()
            ? Promise.resolve(true)
            : isAnimated(file, this.sourceType);

        animatedCheck.then(animated => {
            this.currentFileType = animated ? "gif" : "png";
            let base = file.name.lastIndexOf('.') > 0 ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
            this._filename = base + "_cropped." + this.currentFileType;

            Canvas.fileToImage(file, this.setImageFromFileHelper.bind(this), false, () => {
                // without this a file the browser can't decode left loadingImage stuck and blocked every later open //
                this.loadingImage = false;
                showAlert("Couldn't open " + file.name + ", your browser can't read that image format.");
            });
        });
        return true;
    }

    private setImageFromFileHelper(image: HTMLImageElement) {
        if (this.image.src) {
            URL.revokeObjectURL(this.image.src);
        }

        this.overlay.resize(Point.fromSizeLike(image), false);
        this.overlay.clear();

        this.image.width = image.width;
        this.image.height = image.height;
        this.image.src = image.src;

        this.circle.reset();
        this.zoomFit(true, false);
        this.rotate(0, false);

        this.emitEvent("imagechange", this.image.src);
        this.update("image change");
        this.loadingImage = false;
    }

    public flipHorizontal(): void {
        let c = new Canvas({ size: Point.fromSizeLike(this.image) });
        c.context.scale(-1, 1);
        c.drawImage(this.image, new Rectangle(new Point(0), Point.fromSizeLike(this.image).times(new Point(-1, 1))));
        c.context.setTransform(1, 0, 0, 1, 0, 0);

        this.loadingImage = true;
        c.createImage((img) => {
            this.flipHelper(img, true);
        }, undefined, false);
    }

    public flipVertical(): void {
        let c = new Canvas({ size: Point.fromSizeLike(this.image) });
        c.context.scale(1, -1);
        c.drawImage(this.image, new Rectangle(new Point(0), Point.fromSizeLike(this.image).times(new Point(1, -1))));
        c.context.setTransform(1, 0, 0, 1, 0, 0);

        this.loadingImage = true;
        c.createImage((img: HTMLImageElement) => {
            this.flipHelper(img, false);
        }, undefined, false);
    }

    private flipHelper(image: HTMLImageElement, horizontal: boolean): void {
        if (this.image.src) {
            URL.revokeObjectURL(this.image.src);
        }

        this.image.onload = () => {
            this.rotate(-this.rotation, false);
            if (horizontal) {
                this.circle.cx = this.outerSize.x - this.circle.cx;
            }
            else {
                this.circle.cy = this.outerSize.y - this.circle.cy;
            }
            this.emitEvent("imagechange", this.image.src);
            this.update("flippy");
            this.loadingImage = false;
        };

        this.image.src = image.src;
    }

    public renderCroppedImage(): void {
        this.renderer.render();
    }

    public get filename(): string {
        return this._filename;
    }

    public get src(): string {
        return this.image.src || null;
    }

    public centerCropArea(): void {
        this.circle.center = this.outerRect.center;
        this.circle.validate();
        this.update("center crop");
    }

    public setCropSize(size: number): void {
        this.circle.size = new Point(size);
        this.circle.validate();
        this.update("set crop size");
    }

    private getMouseAction(x: number, y: number): MouseAction {
        if (this.circle.containsPoint(new Point(x, y))) {

            let grabbingHandle = this.circle.center.distanceTo(new Point(x, y)) >= this.circle.radius.x;

            return grabbingHandle ? "resize" : "move";
        }
        else {
            return "new";
        }
    }

    private mouseDown(x: number, y: number): void {
        var action = this.getMouseAction(x, y);
        this.currentAction = action;

        if (this.currentAction !== "none") {
            this.emitEvent("actionstart");
        }

        this.mouseOrigin = new Point(x, y);
        this.circle.saveOrigin();

        this.resizeOffset = this.circle.getPointFromAnchor(this.getCircleAnchor(this.mouseOrigin)).minus(this.mouseOrigin);
    }

    private mouseMove(x: number, y: number): void {
        // determine what cursor to show //
        let action = this.currentAction;
        if (action === "none") {
            action = this.getMouseAction(x, y);
        }

        if (action === "move") {
            this.overlay.canvas.style.cursor = "move";
        }
        else if (action === "resize") {
            let xr = x < this.circle.cx;
            let yr = y < this.circle.cy;
            let thing = +xr ^ +yr; // nice
            this.overlay.canvas.style.cursor = thing ? "nesw-resize" : "nwse-resize";
        }
        else {
            this.overlay.canvas.style.cursor = "default";
        }

        // actually do stuff //
        if (this.currentAction === "none") {
            return;
        }
        else if (this.currentAction === "move") {
            let d = new Point(x, y).minus(this.mouseOrigin);
            this.circle.position = this.circle.origin.position.plus(d);
            this.circle.validate();
            this.mouseOrigin = new Point(x, y);
            this.circle.saveOrigin();
        }
        else if (this.currentAction === "resize") {
            this.performResize(x, y);
        }

        this.circle.round(settings.state.resizeLock); // u rite
        this.update("mouse move");
    }

    private getCircleAnchor(p: Point): RectAnchor {
        let x = p.x;
        let y = p.y;

        if (x > this.circle.cx) {
            if (y > this.circle.cy) {
                return "se";
            }
            else {
                return "ne";
            }
        }
        else {
            if (y > this.circle.cy) {
                return "sw";
            }
            else {
                return "nw";
            }
        }
    }

    private performResize(x: number, y: number) {
        let anchor = Rectangle.anchorOpposite(this.getCircleAnchor(new Point(x, y)));

        if (!settings.state.resizeLock) {
            this.resizeAnchor = this.circle.getPointFromAnchor(anchor).minus(this.resizeOffset);
            let r = Rectangle.between(new Point(x, y), this.resizeAnchor);
            //r.round();
            this.circle.fitInsideGreedy(r, anchor, this.outerRect);
            this.circle.validate();
        }
        else {
            let r = Rectangle.between(new Point(x, y).plus(this.resizeOffset), this.circle.center);
            r.expandToward(anchor, 2);
            //r.round();
            this.circle.fitInsideGreedyCenter(r, this.outerRect);
            this.circle.validate();
        }
    }
}