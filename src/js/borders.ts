import { settings } from "./state";
import { GradientInfo, GradientStop, defaultBorderPresets } from "./presets";

export type { GradientInfo, GradientStop };

export class Border {
    public static get defaults(): GradientInfo[] {
        return JSON.parse(JSON.stringify(defaultBorderPresets));
    }

    // the border lives in the settings store; these keep the old Border.x = y call sites working //
    public static get type(): "none" | "solid" | "gradient" { return settings.state.borderType; }
    public static set type(type: "none" | "solid" | "gradient") { settings.set({ borderType: type }); }

    public static get size(): number { return settings.state.borderSize; }
    public static set size(size: number) { settings.set({ borderSize: size }); }

    public static get color(): string { return settings.state.borderColor; }
    public static set color(color: string) { settings.set({ borderColor: color }); }

    public static get gradient(): GradientInfo { return settings.state.borderGradient; }
    public static set gradient(gradient: GradientInfo) { settings.set({ borderGradient: gradient }); }

    // fills w x h with the gradient at its angle, corner to corner //
    public static fillGradient(ctx: CanvasRenderingContext2D, gradientInfo: GradientInfo, width: number, height: number): void {
        let end = (degrees: number) => {
            let a = degrees * Math.PI / 180;
            // https://math.stackexchange.com/questions/2468060/find-x-y-coordinates-of-a-square-given-an-angle-alpha
            let k = 0.5 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
            return { x: k * Math.cos(a) * width + width / 2, y: k * Math.sin(a) * height + height / 2 };
        };
        let p1 = end(-270 - gradientInfo.angle);
        let p2 = end(-270 - (gradientInfo.angle + 180));

        // swap y values here since geometric y is inverted relative to screen y //
        let gradient = ctx.createLinearGradient(p1.x, p2.y, p2.x, p1.y);
        gradientInfo.gradient.forEach(def => gradient.addColorStop(def.pos, def.color));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    // the border ring for a w x h avatar: solid or gradient, with the middle cut out //
    public static draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.clearRect(0, 0, width, height);
        if (this.type === "none" || this.size === 0) {
            return;
        }

        if (this.type === "solid") {
            ctx.fillStyle = this.color;
            ctx.fillRect(0, 0, width, height);
        } else {
            this.fillGradient(ctx, this.gradient, width, height);
        }

        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.ellipse(width / 2, height / 2, width / 2 * (1 - this.size), height / 2 * (1 - this.size), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
