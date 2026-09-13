import { ClosableDialog } from "./closabledialog";
import { createElement } from "./util";

export class AlertDialog extends ClosableDialog {
    constructor(message: string) {
        super();
        this.container.classList.add("alert");

        this.createEvent("return");

        let messageEl = createElement("p", "message");
        messageEl.innerText = message;

        let ok = createElement("button", "ok");
        ok.innerText = "OK";
        ok.addEventListener("click", () => {
            this.hide();
        });

        this.appendChild(messageEl, ok);
    }

    public hide(): void {
        super.hide();
        this.emitEvent("return");
    }
}
