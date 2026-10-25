import { settings } from "./state";
import { GradientInfo, GradientStop, defaultBorderPresets } from "./presets";

export type { GradientInfo, GradientStop };
import { Point } from "./point";
import { Canvas } from "./canvas";

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

    public static applyGradientToCanvas(gradientInfo : GradientInfo, canvas : Canvas) {
        let a1 = (-270 - gradientInfo.angle) * Math.PI / 180;
        let a2 = (-270 - (gradientInfo.angle + 180)) * Math.PI / 180;
        
        // https://math.stackexchange.com/questions/2468060/find-x-y-coordinates-of-a-square-given-an-angle-alpha
        let p1 = new Point(
            0.5 / Math.max(Math.abs(Math.cos(a1)), Math.abs(Math.sin(a1))) * Math.cos(a1),
            0.5 / Math.max(Math.abs(Math.cos(a1)), Math.abs(Math.sin(a1))) * Math.sin(a1),
        ).times(canvas.size).plus(canvas.size.dividedBy(2));
        
        let p2 = new Point(
            0.5 / Math.max(Math.abs(Math.cos(a2)), Math.abs(Math.sin(a2))) * Math.cos(a2),
            0.5 / Math.max(Math.abs(Math.cos(a2)), Math.abs(Math.sin(a2))) * Math.sin(a2),
        ).times(canvas.size).plus(canvas.size.dividedBy(2));

        // swap y values here since geometric y is inverted relative to screen y //
        let gradient = canvas.context.createLinearGradient(p1.x, p2.y, p2.x, p1.y);
        gradientInfo.gradient.forEach((def) => {
            gradient.addColorStop(def.pos, def.color);
        });
        canvas.context.fillStyle = gradient;
        canvas.context.fillRect(0, 0, canvas.width, canvas.height);
    }

    public static apply(canvas : Canvas) : void {
        canvas.clear();

        if (this.type === "none" || this.size === 0) {
            return;
        } else if (this.type === "solid") {
            canvas.fill(this.color);
            canvas.blendMode = "destination-out";
            canvas.fillCircleInRect(canvas.size.toRectangle().expand(1 - this.size), "white");
            canvas.blendMode = "source-over";
        } else if (this.type === "gradient") {
            this.applyGradientToCanvas(this.gradient, canvas);
            canvas.blendMode = "destination-out";
            canvas.fillCircleInRect(canvas.size.toRectangle().expand(1 - this.size), "white");
            canvas.blendMode = "source-over";
        }
    }
}