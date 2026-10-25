// the crop square and everything you can do to it, as plain functions with no DOM.
// coordinates are in "outer" space: the bounding box of the rotated image //

export interface Crop {
    x: number;
    y: number;
    size: number;
}

export interface Bounds {
    width: number;
    height: number;
}

export type Corner = "nw" | "ne" | "sw" | "se";
export type Hit = "move" | "resize" | "none";

export const MIN_SIZE = 1;

export function defaultCrop(b: Bounds): Crop {
    return { x: 0, y: 0, size: Math.min(b.width, b.height) / 2 };
}

// keeps the square inside the bounds, shrinking it only if it can't fit at all //
export function clampCrop(c: Crop, b: Bounds): Crop {
    let size = Math.max(MIN_SIZE, Math.min(c.size, b.width, b.height));
    return {
        x: Math.min(Math.max(c.x, 0), b.width - size),
        y: Math.min(Math.max(c.y, 0), b.height - size),
        size,
    };
}

export function moveCrop(c: Crop, dx: number, dy: number, b: Bounds): Crop {
    return clampCrop({ x: c.x + dx, y: c.y + dy, size: c.size }, b);
}

export function centerOf(c: Crop): { x: number, y: number } {
    return { x: c.x + c.size / 2, y: c.y + c.size / 2 };
}

export function centerCrop(c: Crop, b: Bounds): Crop {
    return clampCrop({ x: (b.width - c.size) / 2, y: (b.height - c.size) / 2, size: c.size }, b);
}

// inside the circle moves it, the square's corners outside the circle resize it //
export function hitTest(c: Crop, px: number, py: number): Hit {
    if (px < c.x || py < c.y || px > c.x + c.size || py > c.y + c.size) {
        return "none";
    }
    let center = centerOf(c);
    return Math.hypot(px - center.x, py - center.y) >= c.size / 2 ? "resize" : "move";
}

export function cornerAt(c: Crop, px: number, py: number): Corner {
    let center = centerOf(c);
    return ((py < center.y ? "n" : "s") + (px < center.x ? "w" : "e")) as Corner;
}

export function cornerPoint(c: Crop, corner: Corner): { x: number, y: number } {
    return {
        x: corner[1] === "e" ? c.x + c.size : c.x,
        y: corner[0] === "s" ? c.y + c.size : c.y,
    };
}

// drag one corner, the opposite one stays pinned. px/py is where the grabbed corner should go //
export function resizeFromCorner(c: Crop, corner: Corner, px: number, py: number, b: Bounds): Crop {
    let east = corner[1] === "e", south = corner[0] === "s";
    let anchor = cornerPoint(c, (south ? "n" : "s") + (east ? "w" : "e") as Corner);
    let dx = east ? px - anchor.x : anchor.x - px;
    let dy = south ? py - anchor.y : anchor.y - py;

    let room = Math.min(east ? b.width - anchor.x : anchor.x, south ? b.height - anchor.y : anchor.y);
    let size = Math.min(Math.max(dx, dy, MIN_SIZE), room);

    return {
        x: east ? anchor.x : anchor.x - size,
        y: south ? anchor.y : anchor.y - size,
        size,
    };
}

// "lock center": the square grows and shrinks around its middle //
export function resizeFromCenter(c: Crop, px: number, py: number, b: Bounds): Crop {
    let center = centerOf(c);
    let half = Math.max(Math.abs(px - center.x), Math.abs(py - center.y), MIN_SIZE / 2);
    half = Math.min(half, center.x, center.y, b.width - center.x, b.height - center.y);
    return { x: center.x - half, y: center.y - half, size: half * 2 };
}

// whole pixels, so exports don't come out blurry. about the center when the center is locked //
export function roundCrop(c: Crop, aboutCenter: boolean = false): Crop {
    let size = Math.round(c.size);
    if (aboutCenter) {
        let center = centerOf(c);
        return { x: Math.round(center.x - size / 2), y: Math.round(center.y - size / 2), size };
    }
    return { x: Math.round(c.x), y: Math.round(c.y), size };
}

// after a rotation by `degrees`, keeps the crop over the same part of the image by turning its
// center around the image's center, then fits it into the new bounds //
export function rotateCrop(c: Crop, from: Bounds, to: Bounds, degrees: number): Crop {
    let center = centerOf(c);
    let r = degrees / 180 * Math.PI;
    let dx = center.x - from.width / 2, dy = center.y - from.height / 2;
    let x = to.width / 2 + dx * Math.cos(r) - dy * Math.sin(r);
    let y = to.height / 2 + dx * Math.sin(r) + dy * Math.cos(r);
    return clampCrop({ x: x - c.size / 2, y: y - c.size / 2, size: c.size }, to);
}

// the axis-aligned box a w x h image fills once rotated //
export function rotatedBounds(width: number, height: number, degrees: number): Bounds {
    let r = degrees / 180 * Math.PI;
    let cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
    return { width: width * cos + height * sin, height: width * sin + height * cos };
}
