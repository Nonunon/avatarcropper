// border types and the built in gradient presets. no imports, so anything can depend on it //

export type GradientStop = {
    pos: number,
    color: string
};

export type GradientInfo = {
    name: string,
    gradient: GradientStop[],
    angle: number
};

export const defaultBorderPresets: GradientInfo[] = [
    {
        name: "LGBT Pride",
        angle: 0,
        gradient: [
            { pos: 0/5, color: "#FF0018" },
            { pos: 1/5, color: "#FFA52C" },
            { pos: 2/5, color: "#FFFF41" },
            { pos: 3/5, color: "#008018" },
            { pos: 4/5, color: "#0000F9" },
            { pos: 5/5, color: "#86007D" },
        ]
    },
    {
        name: "Trans Pride",
        angle: 0,
        gradient: [
            { pos: 0, color: "#55CDFC" },
            { pos: 0.25, color: "#F7A8B8" },
            { pos: 0.5, color: "#FFFFFF" },
            { pos: 0.75, color: "#F7A8B8" },
            { pos: 1, color: "#55CDFC" }
        ]
    },
    {
        name: "Nonbinary Pride",
        angle: 0,
        gradient: [
            { pos: 0/3, color: "#FFF430" },
            { pos: 1/3, color: "#FFFFFF" },
            { pos: 2/3, color: "#9C59D1" },
            { pos: 3/3, color: "#000000" },
        ]
    },
];
