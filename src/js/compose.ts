import { Canvas } from "./canvas";
import { Point } from "./point";
import { Border } from "./borders";
import { settings, borderKeys } from "./state";

// the one place that turns "image + rotation + crop" into pixels. previews, the Discord card and
// every export draw through here, so what you see is exactly what you save //

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// crop coordinates live in the rotated image's bounding box ("outer" space) //
export interface CropGeometry {
    imageWidth: number;
    imageHeight: number;
    outerWidth: number;
    outerHeight: number;
    rotation: number; // degrees
    flipX?: boolean;
    flipY?: boolean;
    crop: Rect;
}

// Discord's banner sits above the avatar circle, 3.75 avatars wide and 1.5 tall //
export function bannerArea(crop: Rect): Rect {
    let w = crop.width;
    return {
        x: crop.x - (w / 5 + w / 13.33),
        y: crop.y + crop.height / 2 - w * 1.5,
        width: w * 3.75,
        height: w * 1.5,
    };
}

// draws `area` of the rotated source so it fills a width x height region of ctx //
export function drawArea(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    geo: CropGeometry,
    area: Rect,
    width: number,
    height: number,
    smooth: boolean = true
): void {
    ctx.save();
    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = "high";
    ctx.scale(width / area.width, height / area.height);
    ctx.translate(-area.x + geo.outerWidth / 2, -area.y + geo.outerHeight / 2);
    ctx.rotate(geo.rotation / 180 * Math.PI);
    ctx.scale(geo.flipX ? -1 : 1, geo.flipY ? -1 : 1);
    ctx.drawImage(source, -geo.imageWidth / 2, -geo.imageHeight / 2, geo.imageWidth, geo.imageHeight);
    ctx.restore();
}

// border overlays are cached per size and rebuilt when the border settings change //
let borderCache = new Map<string, Canvas>();
settings.subscribe(borderKeys, () => borderCache.clear());

export function borderCanvas(width: number, height: number): Canvas | null {
    if (Border.type === "none" || Border.size === 0) {
        return null;
    }
    let key = width + "x" + height;
    let cached = borderCache.get(key);
    if (!cached) {
        cached = new Canvas({ size: new Point(Math.max(1, Math.round(width)), Math.max(1, Math.round(height))) });
        Border.apply(cached);
        borderCache.set(key, cached);
    }
    return cached;
}

export interface ComposeOptions {
    shape?: "circle" | "square";
    border?: boolean;
    smooth?: boolean;
    area?: Rect; // defaults to the crop
}

// a full avatar: crop, border on top, then the shape cut out //
export function compose(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    geo: CropGeometry,
    width: number,
    height: number,
    options: ComposeOptions = {}
): void {
    let area = options.area || geo.crop;
    ctx.clearRect(0, 0, width, height);
    drawArea(ctx, source, geo, area, width, height, options.smooth !== false);

    if (options.border !== false) {
        let border = borderCanvas(width, height);
        border && ctx.drawImage(border.canvas, 0, 0, width, height);
    }

    if (options.shape === "circle") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath();
        ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
