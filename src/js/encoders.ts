import GIF from "./gif.js";

// animated encoders that all take the same input: a canvas per frame plus its delay //

export interface AnimatedEncoder {
    add(ctx: CanvasRenderingContext2D, delayMs: number): Promise<void>;
    finish(onProgress?: (fraction: number) => void): Promise<Blob>;
    abort(): void;
}

export type AnimatedFormat = "gif" | "webp" | "apng";

export function createEncoder(format: AnimatedFormat, width: number, height: number): AnimatedEncoder {
    if (format === "webp") return new WebPEncoder(width, height);
    if (format === "apng") return new APNGEncoder(width, height);
    return new GIFEncoder(width, height);
}

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob || blob.type !== type) {
                reject(new Error("This browser can't encode " + type));
                return;
            }
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
        }, type, quality);
    });
}

// ---------- GIF (gif.js workers, 256 colors) ---------- //

class GIFEncoder implements AnimatedEncoder {
    private gif: any;

    constructor(width: number, height: number) {
        this.gif = new GIF({
            workers: Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 8),
            quality: 1,
            dither: false,
            width,
            height,
            debug: false,
            copy: true,
        });
    }

    public async add(ctx: CanvasRenderingContext2D, delayMs: number): Promise<void> {
        this.gif.addFrame(ctx, { delay: delayMs, copy: true });
    }

    public finish(onProgress?: (fraction: number) => void): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.gif.on("finished", (blob: Blob) => resolve(blob));
            this.gif.on("abort", () => reject(new Error("aborted")));
            this.gif.on("progress", (p: number) => onProgress && onProgress(p));
            this.gif.render();
        });
    }

    public abort(): void {
        this.gif.abort();
    }
}

// ---------- byte helpers ---------- //

class Bytes {
    private parts: Uint8Array[] = [];
    public length = 0;

    public push(data: Uint8Array | number[]): void {
        let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.parts.push(bytes);
        this.length += bytes.length;
    }

    public toArray(): Uint8Array<ArrayBuffer> {
        let out = new Uint8Array(this.length);
        let offset = 0;
        for (let part of this.parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }
}

const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0));
const u16le = (n: number) => [n & 255, n >> 8 & 255];
const u24le = (n: number) => [n & 255, n >> 8 & 255, n >> 16 & 255];
const u32le = (n: number) => [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255];
const u32be = (n: number) => [n >>> 24 & 255, n >> 16 & 255, n >> 8 & 255, n & 255];
const u16be = (n: number) => [n >> 8 & 255, n & 255];

// ---------- animated WebP (each frame encoded by the browser, then wrapped in ANMF chunks) ---------- //

class WebPEncoder implements AnimatedEncoder {
    private frames: { data: Uint8Array, delay: number }[] = [];
    private aborted = false;
    private hasAlpha = false;

    constructor(private width: number, private height: number) { }

    public async add(ctx: CanvasRenderingContext2D, delayMs: number): Promise<void> {
        let file = await canvasBytes(ctx.canvas, "image/webp", 1);
        let chunks = this.frameChunks(file);
        this.frames.push({ data: chunks, delay: delayMs });
    }

    // keeps a single-image WebP's ALPH / VP8 / VP8L chunks, dropping the RIFF header and VP8X //
    private frameChunks(file: Uint8Array): Uint8Array {
        let out = new Bytes();
        let view = new DataView(file.buffer, file.byteOffset, file.byteLength);
        let pos = 12;
        while (pos + 8 <= file.length) {
            let id = String.fromCharCode(file[pos], file[pos + 1], file[pos + 2], file[pos + 3]);
            let size = view.getUint32(pos + 4, true);
            let total = 8 + size + (size & 1);
            if (id === "ALPH" || id === "VP8 " || id === "VP8L") {
                out.push(file.subarray(pos, pos + total));
                // VP8L carries its own alpha flag; ALPH means lossy with alpha //
                if (id === "ALPH" || (id === "VP8L" && (file[pos + 8 + 4] & 0x10))) this.hasAlpha = true;
            }
            pos += total;
        }
        return out.toArray();
    }

    public async finish(): Promise<Blob> {
        if (this.aborted) throw new Error("aborted");
        let body = new Bytes();
        body.push(ascii("WEBP"));

        // VP8X: animation + alpha flags and the canvas size //
        body.push([...ascii("VP8X"), ...u32le(10), (this.hasAlpha ? 0x10 : 0) | 0x02, 0, 0, 0, ...u24le(this.width - 1), ...u24le(this.height - 1)]);
        // ANIM: transparent background, loop forever //
        body.push([...ascii("ANIM"), ...u32le(6), 0, 0, 0, 0, ...u16le(0)]);

        for (let frame of this.frames) {
            let size = 16 + frame.data.length;
            body.push([...ascii("ANMF"), ...u32le(size),
                ...u24le(0), ...u24le(0),
                ...u24le(this.width - 1), ...u24le(this.height - 1),
                ...u24le(Math.min(frame.delay, 0xffffff)),
                0x02, // don't blend, every frame is a whole picture //
            ]);
            body.push(frame.data);
            if (size & 1) body.push([0]);
        }

        let file = new Bytes();
        file.push([...ascii("RIFF"), ...u32le(body.length)]);
        file.push(body.toArray());
        return new Blob([file.toArray()], { type: "image/webp" });
    }

    public abort(): void {
        this.aborted = true;
    }
}

// ---------- APNG (each frame encoded as PNG by the browser, IDATs rewrapped as fdAT) ---------- //

const crcTable = (() => {
    let table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array | number[]): Uint8Array {
    let body = new Uint8Array(4 + data.length);
    body.set(ascii(type), 0);
    body.set(data instanceof Uint8Array ? data : new Uint8Array(data), 4);
    let out = new Bytes();
    out.push(u32be(data.length));
    out.push(body);
    out.push(u32be(crc32(body)));
    return out.toArray();
}

function readPng(file: Uint8Array): { ihdr: Uint8Array, idats: Uint8Array[] } {
    let view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    let pos = 8;
    let ihdr: Uint8Array = null;
    let idats: Uint8Array[] = [];
    while (pos + 8 <= file.length) {
        let len = view.getUint32(pos);
        let type = String.fromCharCode(file[pos + 4], file[pos + 5], file[pos + 6], file[pos + 7]);
        let data = file.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") ihdr = data;
        if (type === "IDAT") idats.push(data);
        pos += 12 + len;
    }
    return { ihdr, idats };
}

class APNGEncoder implements AnimatedEncoder {
    private frames: { idats: Uint8Array[], delay: number }[] = [];
    private ihdr: Uint8Array = null;
    private aborted = false;

    constructor(private width: number, private height: number) { }

    public async add(ctx: CanvasRenderingContext2D, delayMs: number): Promise<void> {
        let png = readPng(await canvasBytes(ctx.canvas, "image/png"));
        if (!this.ihdr) {
            this.ihdr = png.ihdr;
        } else if (png.ihdr[9] !== this.ihdr[9] || png.ihdr[8] !== this.ihdr[8]) {
            // every frame has to share one pixel format; the browser normally keeps it the same //
            throw new Error("Frames came out in different PNG formats");
        }
        this.frames.push({ idats: png.idats, delay: delayMs });
    }

    public async finish(): Promise<Blob> {
        if (this.aborted) throw new Error("aborted");
        let out = new Bytes();
        let seq = 0;
        out.push([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        out.push(pngChunk("IHDR", this.ihdr));
        out.push(pngChunk("acTL", [...u32be(this.frames.length), ...u32be(0)]));

        this.frames.forEach((frame, i) => {
            out.push(pngChunk("fcTL", [
                ...u32be(seq++),
                ...u32be(this.width), ...u32be(this.height),
                ...u32be(0), ...u32be(0),
                ...u16be(Math.min(frame.delay, 65535)), ...u16be(1000),
                0, // dispose: none //
                0, // blend: source, every frame is a whole picture //
            ]));
            for (let idat of frame.idats) {
                if (i === 0) {
                    out.push(pngChunk("IDAT", idat));
                } else {
                    let data = new Uint8Array(4 + idat.length);
                    data.set(u32be(seq++), 0);
                    data.set(idat, 4);
                    out.push(pngChunk("fdAT", data));
                }
            }
        });

        out.push(pngChunk("IEND", []));
        return new Blob([out.toArray()], { type: "image/png" });
    }

    public abort(): void {
        this.aborted = true;
    }
}
