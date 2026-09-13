import { InputDialog } from "./inputdialog";
import { createElement } from "./util";

export class ConfirmDialog extends InputDialog<boolean> {
    constructor(message: string) {
        super();
        this.container.classList.add("confirm");

        let messageEl = createElement("p", "message");
        messageEl.innerText = message;

        let buttonRow = createElement("div", "row");

        let no = createElement("button", "cancel");
        no.innerText = "No";
        no.addEventListener("click", () => {
            this.emitEvent("return", false);
            this.hide();
        });

        let yes = createElement("button", "ok");
        yes.innerText = "Yes";
        yes.addEventListener("click", () => {
            this.emitEvent("return", true);
            this.hide();
        });

        buttonRow.appendChild(no);
        buttonRow.appendChild(yes);

        this.appendChild(messageEl, buttonRow);
    }

    public dismiss(): void {
        this.hide();
    }
}
