// frame access for animated images through the browser's own decoder (WebCodecs ImageDecoder).
// it handles GIF, animated WebP, APNG and animated AVIF, and hands back fully composited frames.
// where it's missing (older Firefox/Safari), GIFs still go through supergif and the rest stay static //

const ImageDecoderCtor: any = (window as any).ImageDecoder;

export interface FrameSource {
    length: number;
    width: number;
    height: number;
    // delay in ms for frame i //
    delay(i: number): number;
    draw(i: number, target: CanvasRenderingContext2D): Promise<void>;
    close(): void;
}

export function canDecodeFrames(): boolean {
    return !!ImageDecoderCtor;
}

// APNGs usually arrive as image/png, the decoder only needs to know the container //
function decoderType(type: string): string {
    return type === "image/apng" ? "image/png" : type;
}

async function openDecoder(file: Blob, type: string): Promise<any> {
    if (!ImageDecoderCtor || !type) {
        return null;
    }
    let mime = decoderType(type);
    if (!(await ImageDecoderCtor.isTypeSupported(mime))) {
        return null;
    }
    let decoder = new ImageDecoderCtor({ data: await file.arrayBuffer(), type: mime });
    await decoder.tracks.ready;
    return decoder;
}

export async function isAnimated(file: Blob, type: string): Promise<boolean> {
    try {
        let decoder = await openDecoder(file, type);
        if (!decoder) {
            return false;
        }
        await decoder.completed;
        let track = decoder.tracks.selectedTrack;
        let animated = !!track && track.animated && track.frameCount > 1;
        decoder.close();
        return animated;
    } catch {
        return false;
    }
}

export async function openFrames(file: Blob, type: string): Promise<FrameSource | null> {
    let decoder: any;
    try {
        decoder = await openDecoder(file, type);
        if (!decoder) {
            return null;
        }
        await decoder.completed;
    } catch {
        return null;
    }

    let track = decoder.tracks.selectedTrack;
    let delays: number[] = [];
    let first = (await decoder.decode({ frameIndex: 0 })).image;
    let width = first.displayWidth;
    let height = first.displayHeight;
    first.close();

    return {
        length: track.frameCount,
        width,
        height,
        delay: (i: number) => {
            let ms = delays[i];
            // browsers play near-zero delays at 100ms, so match what the cropper showed //
            return ms === undefined || ms <= 10 ? 100 : ms;
        },
        draw: async (i: number, target: CanvasRenderingContext2D) => {
            let frame = (await decoder.decode({ frameIndex: i })).image;
            delays[i] = Math.round((frame.duration || 0) / 1000);
            target.clearRect(0, 0, width, height);
            target.drawImage(frame, 0, 0, width, height);
            frame.close();
        },
        close: () => decoder.close(),
    };
}

// plays an animation into one canvas on its own clock, so the editor and every preview can draw
// the current frame (a hidden <img> stops animating, so it can't be the source) //
export class FramePlayer {
    public readonly canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private index = -1;
    private nextAt = 0;
    private busy = false;
    private running = false;
    private closed = false;

    private constructor(private decoder: any, private count: number, width: number, height: number, private onFrame: () => void) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext("2d");
    }

    public static async open(file: Blob, type: string, onFrame: () => void): Promise<FramePlayer | null> {
        try {
            let decoder = await openDecoder(file, type);
            if (!decoder) {
                return null;
            }
            await decoder.completed;
            let first = (await decoder.decode({ frameIndex: 0 })).image;
            let player = new FramePlayer(decoder, decoder.tracks.selectedTrack.frameCount, first.displayWidth, first.displayHeight, onFrame);
            first.close();
            await player.show(0, performance.now());
            return player;
        } catch {
            return null;
        }
    }

    private async show(i: number, now: number): Promise<void> {
        this.busy = true;
        let frame = (await this.decoder.decode({ frameIndex: i })).image;
        if (this.closed) {
            frame.close();
            return;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(frame, 0, 0);
        let ms = Math.round((frame.duration || 0) / 1000);
        frame.close();
        this.index = i;
        // same as browsers: near-zero delays play at 100ms //
        this.nextAt = now + (ms <= 10 ? 100 : ms);
        this.busy = false;
        this.onFrame();
    }

    public start(): void {
        if (this.running || this.closed) return;
        this.running = true;
        let tick = (now: number) => {
            if (!this.running) return;
            if (!this.busy && now >= this.nextAt) {
                this.show((this.index + 1) % this.count, now).catch(() => this.busy = false);
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    public stop(): void {
        this.running = false;
    }

    public close(): void {
        this.stop();
        this.closed = true;
        this.decoder.close();
    }
}
