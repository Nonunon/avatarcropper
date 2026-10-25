import { CropView } from "./cropview";
import { Dialog } from "./dialog";
import { createElement, hideElement, showElement, makePixelated } from "./util";
import { FractionalProgressBar } from "./fractionalprogressbar";
import { Canvas } from "./canvas";
import { ClosableDialog } from "./closabledialog";
import { Point } from "./point";
import { Border } from "./borders";
import { Settings } from "./avatarcropper";

import SuperGif from './supergif.js'
import GIF from './gif.js'
import { Rectangle } from "./rectangle";

interface CropOption {
    label: string;
    url: string;
}

export class Renderer extends ClosableDialog {
    private readonly renderedString = "Rendered! Yayy! ❤️";
    private readonly renderingString = "Rendering...";
    private readonly cropView: CropView;
    private shouldStopRendering: boolean = false;
    private currentlyRendering: boolean = false;
    private progressBar: FractionalProgressBar;
    private readonly imageElement: HTMLImageElement;
    private optionBar: HTMLElement;
    private headerElement: HTMLElement;
    private noteElement: HTMLElement;
    private pleaseWaitElement: HTMLElement;
    private saveButton: HTMLElement;
    private loadGif: any;
    private readonly initialized: boolean = false;
    public readonly settings: Settings;

    constructor(cropView: CropView) {
        super();

        this.dialog.classList.add("dialog-render");

        this.createEvent("close");
        this.settings = cropView.settings
        this.cropView = cropView;

        this.headerElement = createElement("h1", "header");
        this.headerElement.innerText = this.renderingString;

        this.progressBar = new FractionalProgressBar();

        this.imageElement = <HTMLImageElement>createElement("img", "image");

        this.noteElement = createElement("div", "note");
        this.noteElement.innerText = "Save as a Square for Discord!";

        this.pleaseWaitElement = createElement("div", "pleaseWait");
        this.pleaseWaitElement.innerText = "Aborting render... please wait...";

        this.optionBar = createElement("div", "optionBar");

        this.saveButton = createElement("a", "save");
        this.saveButton.innerText = "Save";
        this.saveButton.addEventListener("mouseover", () => {
            (<HTMLAnchorElement>this.saveButton).href = this.imageElement.src;
        });

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

    public render() {
        this.currentlyRendering = true;
        this.shouldStopRendering = false;
        this.show();

        if (this.cropView.currentFileType === "gif") {
            this.renderGif();
        }
        else {
            this.getFrameURLs(this.cropView.image, false, this.display.bind(this));
            this.currentlyRendering = false;
        }
    }

    private renderGif(): void {
        let area = this.settings.banneroutlinesEnabled ? this.bannerArea() : this.cropView.cropArea;
        let gif = new SuperGif({
            gif: this.cropView.image.cloneNode()
        });

        this.loadGif = gif;

        let onload = () => {
            this.loadGif = null;

            if (this.shouldStopRendering) {
                this.currentlyRendering = false;
                this.tryClose();
            }

            let saveGif = new GIF({
                workers: Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 8),
                quality: 1,
                dither: false,
                width: area.width,
                height: area.height,
                debug: false,
                copy: true
            });

            let len = gif.get_length();
            this.progressBar.addFractionPart(1 / 6, len);

            // one set of canvases reused for every frame, handed straight to the encoder
            // (this used to encode each frame to a PNG and decode it again) //
            let border = this.borderCanvas(true);
            let rotated = new Canvas({ size: this.cropView.outerSize, pixelated: true });
            let crop = new Canvas({ size: area.size, pixelated: true });

            let renderFrame = (i: number) => {
                if (this.shouldStopRendering) {
                    this.currentlyRendering = false;
                    this.tryClose();
                    return;
                }

                gif.move_to(i);
                this.drawRotated(gif.get_canvas(), rotated);
                this.drawCrop(rotated, area, border, crop);

                saveGif.addFrame(crop.context, {
                    delay: gif.get_frames()[i].delay * 10 || 10,
                    copy: true
                });

                this.progressBar.step();

                i++;
                if (i === len) {
                    saveGif.render();
                }
                else {
                    // yield so the progress bar can paint //
                    setTimeout(() => renderFrame(i), 0);
                }
            };

            saveGif.on("finished", (blob: Blob) => {
                let url = URL.createObjectURL(blob);
                this.display([
                    {
                        label: "GIF",
                        url: url
                    }
                ]);

                this.currentlyRendering = false;
            });

            saveGif.on("abort", () => {
                this.currentlyRendering = false;
                this.tryClose();
            });

            saveGif.on("progress", (progress: number) => {
                this.progressBar.progress = 1 / 6 + progress * 5 / 6;

                if (this.shouldStopRendering) {
                    saveGif.abort();
                }
            });

            renderFrame(0);
        };

        gif.load(onload, undefined, () => {
            this.loadGif = null;
            this.currentlyRendering = false;
            this.tryClose();
        });
    }

    private bannerArea(): Rectangle {
        let c = this.cropView.circle;
        return new Rectangle(
            new Point(c.left - (c.width / 5 + c.width / 13.33), c.cy - c.width * 1.5),
            new Point(c.width * 3.75, c.width * 1.5)
        );
    }

    private borderCanvas(pixelated: boolean): Canvas {
        let border = new Canvas({
            size: this.cropView.cropArea.size,
            pixelated: pixelated
        });
        Border.apply(border);
        return border;
    }

    // the whole frame, rotated the way the crop view shows it //
    private drawRotated(frame: Canvas | HTMLImageElement | HTMLCanvasElement, target: Canvas): Canvas {
        target.clear();
        target.drawRotatedImage(
            frame,
            this.cropView.rotation / 180 * Math.PI,
            this.cropView.outerSize.dividedBy(2).minus(this.cropView.innerSize.dividedBy(2))
        );
        return target;
    }

    private drawCrop(source: Canvas, area: Rectangle, border: Canvas, target: Canvas): Canvas {
        target.clear();
        target.drawCroppedImage(source, new Point(0), area);
        target.drawImage(border, new Point(0));
        return target;
    }

    private getFrameURLs(frame: Canvas | HTMLImageElement | HTMLCanvasElement, pixelated: boolean, callback: (options: CropOption[]) => void): void {
        let wantBanner = this.settings.banneroutlinesEnabled;
        let ret: CropOption[] = [];
        let expected = wantBanner ? 3 : 2;
        let counter = 0;
        let check = (blob: Blob, label: string, index: number) => {
            ret[index] = { url: URL.createObjectURL(blob), label };
            if (++counter === expected) {
                callback(ret);
            }
        };

        let border = this.borderCanvas(pixelated);
        let rotated = this.drawRotated(frame, new Canvas({ size: this.cropView.outerSize, pixelated: pixelated }));
        let cropArea = this.cropView.cropArea;

        let square = this.drawCrop(rotated, cropArea, border, new Canvas({ size: cropArea.size, pixelated: pixelated }));
        square.createBlob(blob => check(blob, "Square", 0));

        let circle = this.drawCrop(rotated, cropArea, border, new Canvas({ size: cropArea.size, pixelated: pixelated }));
        circle.blendMode = "destination-in";
        circle.fillCircleInSquare(new Point(0), circle.width, "white");
        circle.createBlob(blob => check(blob, "Circle", 1));

        if (wantBanner) {
            let area = this.bannerArea();
            let banner = this.drawCrop(rotated, area, border, new Canvas({ size: area.size, pixelated: pixelated }));
            banner.createBlob(blob => check(blob, "Discord Banner", 2));
        }
    }

    private display(cropOptions: CropOption[]): void {
        this.progressBar.hide();
        showElement(this.optionBar);
        showElement(this.saveButton);
        this.headerElement.innerText = this.renderedString;
        this.optionBar.innerHTML = "";
        let firstButton: HTMLElement;

        cropOptions.forEach((option, i) => {
            let b = createElement("button", "option");
            b.innerText = option.label;
            (<any>b).url = option.url;
            b.addEventListener("click", () => {
                this.imageElement.src = option.url;

                let bs = this.optionBar.children;
                for (let i = 0; i < bs.length; i++) {
                    bs[i].classList.remove("toggled");
                }

                b.classList.add("toggled");
            });

            this.optionBar.appendChild(b);

            if (i === 0) {
                firstButton = b;
            }
        });

        this.imageElement.onload = () => {
            this.contentContainer.scrollTop = this.contentContainer.scrollHeight;
            this.imageElement.onload = null;
        };

        firstButton.click();
    }

    public show() {
        this.progressBar.show();
        this.progressBar.reset();
        this.headerElement.innerText = this.renderingString;
        hideElement(this.optionBar);
        hideElement(this.saveButton);
        hideElement(this.pleaseWaitElement);
        this.imageElement.src = "";
        this.saveButton.setAttribute("download", this.cropView.filename);
        makePixelated(this.imageElement, !this.cropView.antialias);
        super.show();
    }

    public hide(force: boolean = false) {
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

        let bs = this.optionBar.children;
        for (let i = 0; i < bs.length; i++) {
            (<any>bs[i]).url && URL.revokeObjectURL((<any>bs[i]).url);
        }

        this.emitEvent("close");
        this.hide(true);
        return true;
    }
}