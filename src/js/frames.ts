import { Canvas } from "./canvas";

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
    draw(i: number, target: Canvas): Promise<void>;
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
        draw: async (i: number, target: Canvas) => {
            let frame = (await decoder.decode({ frameIndex: i })).image;
            delays[i] = Math.round((frame.duration || 0) / 1000);
            target.clear();
            target.context.drawImage(frame, 0, 0, width, height);
            frame.close();
        },
        close: () => decoder.close(),
    };
}
