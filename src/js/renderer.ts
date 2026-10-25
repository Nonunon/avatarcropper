import { CropView } from "./cropview";
import { createElement, hideElement, showElement, makePixelated } from "./util";
import { FractionalProgressBar } from "./fractionalprogressbar";
import { ClosableDialog } from "./closabledialog";
import { settings } from "./state";
import { compose, bannerArea } from "./compose";
import type { Rect, CropGeometry } from "./compose";
import { FrameSource, openFrames } from "./frames";
import { createEncoder, AnimatedFormat } from "./encoders";
import SuperGif from "./supergif.js";

// one output choice in the dialog, made the first time it's picked //
interface CropOption {
    label: string;
    extension: string;
    url?: string;
    make: () => Promise<string>;
}

class Aborted extends Error { }

export class Renderer extends ClosableDialog {
    private readonly renderedString = "Rendered! Yayy! ❤️";
    private readonly cropView: CropView;
    private shouldStopRendering: boolean = false;
    private currentlyRendering: boolean = false;
    private progressBar: FractionalProgressBar;
    private readonly imageElement: HTMLImageElement;
    private optionBar: HTMLElement;
    private headerElement: HTMLElement;
    private noteElement: HTMLElement;
    private pleaseWaitElement: HTMLElement;
    private saveButton: HTMLAnchorElement;
    private loadGif: any;
    private frames: FrameSource | null = null;
    private urls: string[] = [];
    private readonly initialized: boolean = false;

    constructor(cropView: CropView) {
        super();

        this.dialog.classList.add("dialog-render");

        this.createEvent("close");
        this.cropView = cropView;

        this.headerElement = createElement("h1", "header");
        this.progressBar = new FractionalProgressBar();
        this.imageElement = <HTMLImageElement>createElement("img", "image");

        this.noteElement = createElement("div", "note");
        this.noteElement.innerText = "Save as a Square for Discord!";

        this.pleaseWaitElement = createElement("div", "pleaseWait");
        this.pleaseWaitElement.innerText = "Aborting render... please wait...";

        this.optionBar = createElement("div", "optionBar");

        this.saveButton = <HTMLAnchorElement>createElement("a", "save");
        this.saveButton.innerText = "Save";

        this.appendChild(
            this.headerElement,
            this.progressBar,
            this.imageElement,
            this.noteElement,
            this.pleaseWaitElement,
            this.optionBar,
            this.saveButton
        );

        this.initialized = true;
    }

    public render(): void {
        this.shouldStopRendering = false;
        this.show();

        if (this.cropView.isAnimated) {
            this.renderAnimated();
        }
        else {
            this.display(this.stillOptions(this.cropView.image));
        }
    }

    private get baseName(): string {
        let name = this.cropView.filename || "avatar_cropped.png";
        return name.substring(0, name.lastIndexOf(".")) || name;
    }

    private canvas(width: number, height: number): CanvasRenderingContext2D {
        let c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(width));
        c.height = Math.max(1, Math.round(height));
        return c.getContext("2d", { willReadFrequently: true });
    }

    private composeTo(ctx: CanvasRenderingContext2D, source: CanvasImageSource, geo: CropGeometry, area: Rect, shape: "circle" | "square", border: boolean): void {
        compose(ctx, source, geo, ctx.canvas.width, ctx.canvas.height, {
            area,
            shape,
            border,
            smooth: this.cropView.antialias,
        });
    }

    private track(blob: Blob): string {
        let url = URL.createObjectURL(blob);
        this.urls.push(url);
        return url;
    }

    // ---------- stills ---------- //

    private stillOptions(frame: CanvasImageSource): CropOption[] {
        let geo = this.cropView.geometry;
        let outputs: { label: string, area: Rect, shape: "circle" | "square", border: boolean }[] = [
            { label: "Square", area: geo.crop, shape: "square", border: true },
            { label: "Circle", area: geo.crop, shape: "circle", border: true },
        ];
        if (settings.state.banneroutlinesEnabled) {
            outputs.push({ label: "Discord Banner", area: bannerArea(geo.crop), shape: "square", border: false });
        }

        return outputs.map(out => ({
            label: out.label,
            extension: "png",
            make: () => new Promise<string>(resolve => {
                let ctx = this.canvas(out.area.width, out.area.height);
                this.composeTo(ctx, frame, geo, out.area, out.shape, out.border);
                ctx.canvas.toBlob(blob => resolve(this.track(blob)), "image/png");
            }),
        }));
    }

    // ---------- animations ---------- //

    // frames come from the browser's decoder (gif, webp, apng, avif), or supergif for gifs where it's missing //
    private async openSource(): Promise<FrameSource> {
        let source = await openFrames(this.cropView.sourceFile, this.cropView.sourceType);
        if (source) {
            return source;
        }

        return new Promise((resolve, reject) => {
            let gif = new SuperGif({ gif: this.cropView.image.cloneNode() });
            this.loadGif = gif;
            gif.load(() => {
                this.loadGif = null;
                resolve({
                    length: gif.get_length(),
                    width: gif.get_canvas().width,
                    height: gif.get_canvas().height,
                    delay: (i: number) => gif.get_frames()[i].delay * 10 || 100,
                    draw: async (i: number, target: CanvasRenderingContext2D) => {
                        gif.move_to(i);
                        target.clearRect(0, 0, target.canvas.width, target.canvas.height);
                        target.drawImage(gif.get_canvas(), 0, 0);
                    },
                    close: () => { },
                });
            }, undefined, () => {
                this.loadGif = null;
                reject(new Aborted());
            });
        });
    }

    private async renderAnimated(): Promise<void> {
        this.currentlyRendering = true;
        try {
            this.frames = await this.openSource();
        } catch {
            this.finishAborted();
            return;
        }
        this.currentlyRendering = false;
        if (this.shouldStopRendering) {
            this.finishAborted();
            return;
        }

        let make = (format: AnimatedFormat) => () => this.encode(format);
        this.display([
            { label: "GIF", extension: "gif", make: make("gif") },
            { label: "WebP", extension: "webp", make: make("webp") },
            { label: "APNG", extension: "png", make: make("apng") },
        ]);
    }

    private async encode(format: AnimatedFormat): Promise<string> {
        let source = this.frames;
        let geo = this.cropView.geometry;
        let banner = settings.state.banneroutlinesEnabled;
        let area = banner ? bannerArea(geo.crop) : geo.crop;
        let crop = this.canvas(area.width, area.height);
        let frame = this.canvas(source.width, source.height);
        let encoder = createEncoder(format, crop.canvas.width, crop.canvas.height);

        // gif spends most of its time in the workers afterwards, the others while adding frames //
        let addShare = format === "gif" ? 1 / 6 : 0.95;
        this.progressBar.reset();
        this.progressBar.addFractionPart(addShare, source.length);

        for (let i = 0; i < source.length; i++) {
            if (this.shouldStopRendering) {
                encoder.abort();
                throw new Aborted();
            }
            await source.draw(i, frame);
            this.composeTo(crop, frame.canvas, geo, area, "square", !banner);
            await encoder.add(crop, source.delay(i));
            this.progressBar.step();
            // yield so the progress bar can paint //
            await new Promise(r => setTimeout(r, 0));
        }

        let blob = await encoder.finish(p => {
            this.progressBar.progress = addShare + p * (1 - addShare);
            if (this.shouldStopRendering) encoder.abort();
        });
        return this.track(blob);
    }

    // ---------- dialog ---------- //

    private display(options: CropOption[]): void {
        this.optionBar.innerHTML = "";
        showElement(this.optionBar);
        let buttons: HTMLElement[] = [];

        let select = async (option: CropOption, button: HTMLElement) => {
            if (this.currentlyRendering) {
                return;
            }
            buttons.forEach(b => b.classList.toggle("toggled", b === button));

            if (!option.url) {
                this.currentlyRendering = true;
                this.headerElement.innerText = "Rendering " + option.label + "...";
                hideElement(this.saveButton);
                this.progressBar.show();
                try {
                    option.url = await option.make();
                } catch (e) {
                    this.currentlyRendering = false;
                    if (e instanceof Aborted || this.shouldStopRendering) {
                        this.finishAborted();
                    } else {
                        this.headerElement.innerText = "Couldn't make the " + option.label + ": " + (e as Error).message;
                        this.progressBar.hide();
                    }
                    return;
                }
                this.currentlyRendering = false;
                if (this.shouldStopRendering) {
                    this.finishAborted();
                    return;
                }
            }

            this.progressBar.hide();
            this.headerElement.innerText = this.renderedString;
            this.imageElement.src = option.url;
            this.saveButton.href = option.url;
            let suffix = option.label === "Circle" ? "_circle" : option.label === "Discord Banner" ? "_banner" : "";
            this.saveButton.download = this.baseName + suffix + "." + option.extension;
            showElement(this.saveButton);
        };

        options.forEach(option => {
            let b = createElement("button", "option");
            b.innerText = option.label;
            b.addEventListener("click", () => select(option, b));
            this.optionBar.appendChild(b);
            buttons.push(b);
        });

        this.imageElement.onload = () => {
            this.contentContainer.scrollTop = this.contentContainer.scrollHeight;
        };

        select(options[0], buttons[0]);
    }

    private finishAborted(): void {
        this.currentlyRendering = false;
        this.shouldStopRendering = false;
        this.tryClose();
    }

    public show(): void {
        this.progressBar.show();
        this.progressBar.reset();
        this.headerElement.innerText = "Rendering...";
        hideElement(this.optionBar);
        hideElement(this.saveButton);
        hideElement(this.pleaseWaitElement);
        this.imageElement.removeAttribute("src");
        makePixelated(this.imageElement, !this.cropView.antialias);
        super.show();
    }

    public hide(force: boolean = false): void {
        if (force || !this.initialized) {
            super.hide();
        }
        else {
            this.tryClose();
        }
    }

    public tryClose(): boolean {
        if (this.currentlyRendering) {
            this.shouldStopRendering = true;
            this.loadGif && this.loadGif.abort();
            showElement(this.pleaseWaitElement);
            return false;
        }

        this.urls.forEach(url => URL.revokeObjectURL(url));
        this.urls = [];
        this.frames && this.frames.close();
        this.frames = null;

        this.emitEvent("close");
        this.hide(true);
        return true;
    }
}
