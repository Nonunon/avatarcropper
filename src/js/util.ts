export type SortFunction<T> = (a: T, b: T) => boolean;

export function createElement(type: string, className: string = ""): HTMLElement {
    let ret = document.createElement(type);
    ret.className = className;
    return ret;
}

export function makePixelated(e: HTMLImageElement | HTMLCanvasElement, pixelate: boolean = true): void {
    if (pixelate) {
        let types = ["optimizeSpeed", "crisp-edges", "-moz-crisp-edges", "-webkit-optimize-contrast", "optimize-contrast", "pixelated"];
        types.forEach(type => e.style["image-rendering"] = type);
    }
    else {
        e.style["image-rendering"] = "";
    }
}

export function hideElement(element: HTMLElement): void {
    element.style.display = "none";
}

export function showElement(element: HTMLElement): void {
    element.style.display = "";
}

export function array_contains<T>(array: T[], item: T): boolean {
    return array.indexOf(item) !== -1;
}

export function array_remove<T>(array: T[], item: T): { item: T, index: number, existed: boolean } {
    let index = array.indexOf(item);
    if (index !== -1) {
        array.splice(index, 1);
        return { item, index, existed: true };
    }

    return { item, index: -1, existed: false };
}

export function array_insert<T>(array: T[], item: T, index_or_fn: number | SortFunction<T>): { item: T, index: number } {
    if (typeof index_or_fn === "number") {
        array.splice(index_or_fn, 0, item);
        return { item: item, index: index_or_fn };
    }
    else {
        for (let i = 0; i < array.length; i++) {
            if (index_or_fn(item, array[i])) {
                array.splice(i, 0, item);
                return { item: item, index: i };
            }
        }

        array.push(item);
        return { item: item, index: array.length - 1 };
    }

}

export function array_last<T>(array: T[]): T {
    return array[array.length - 1];
}

export function stopProp(e: MouseEvent): void {
    e.stopPropagation();
}

