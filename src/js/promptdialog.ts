import { InputDialog } from "./inputdialog";
import { createElement } from "./util";

export class PromptDialog extends InputDialog<string> {
    private input: HTMLInputElement;

    constructor(message: string, defaultValue: string = "") {
        super();
        this.container.classList.add("prompt");

        let messageEl = createElement("p", "message");
        messageEl.innerText = message;

        this.input = createElement("input") as HTMLInputElement;
        this.input.type = "text";
        this.input.value = defaultValue;
        this.input.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
                this.submit();
            } else if (e.key === "Escape") {
                this.cancel();
            }
        });

        let buttonRow = createElement("div", "row");

        let cancel = createElement("button", "cancel");
        cancel.innerText = "Cancel";
        cancel.addEventListener("click", () => this.cancel());

        let ok = createElement("button", "ok");
        ok.innerText = "OK";
        ok.addEventListener("click", () => this.submit());

        buttonRow.appendChild(cancel);
        buttonRow.appendChild(ok);

        this.appendChild(messageEl, this.input, buttonRow);
    }

    public show(): void {
        super.show();
        this.input.focus();
        this.input.select();
    }

    public dismiss(): void {
        this.hide();
    }

    private submit(): void {
        this.emitEvent("return", this.input.value);
        this.hide();
    }

    private cancel(): void {
        this.emitEvent("return", null);
        this.hide();
    }
}
