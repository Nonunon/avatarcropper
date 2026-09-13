import { AlertDialog } from "./alertdialog";
import { ConfirmDialog } from "./confirmdialog";
import { PromptDialog } from "./promptdialog";
import { Widget } from "./widget";

function mount(dialog: Widget): void {
    document.getElementById("container").appendChild(dialog.container);
    dialog.show();
}

// drop-in, non-blocking replacement for window.alert() //
export function showAlert(message: string): Promise<void> {
    return new Promise(resolve => {
        let d = new AlertDialog(message);
        d.on("return", () => resolve());
        mount(d);
    });
}

// drop-in, non-blocking replacement for window.confirm() //
export function showConfirm(message: string): Promise<boolean> {
    return new Promise(resolve => {
        let d = new ConfirmDialog(message);
        d.on("return", (result: boolean) => resolve(!!result));
        mount(d);
    });
}

// drop-in, non-blocking replacement for window.prompt() //
export function showPrompt(message: string, defaultValue: string = ""): Promise<string | null> {
    return new Promise(resolve => {
        let d = new PromptDialog(message, defaultValue);
        d.on("return", (result: string | null) => resolve(result));
        mount(d);
    });
}
