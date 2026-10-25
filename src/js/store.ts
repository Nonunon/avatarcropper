// a small typed state container. components read `store.state`, change it with `store.set()`,
// and subscribe to just the keys they care about. with a storage key it also saves itself //

type Listener<T> = (state: Readonly<T>, changed: (keyof T)[]) => void;

export class Store<T extends object> {
    private current: T;
    private listeners: { keys: (keyof T)[] | null, fn: Listener<T> }[] = [];
    private saveTimer: number = 0;

    constructor(defaults: T, private storageKey?: string) {
        this.current = { ...defaults };

        if (storageKey) {
            let saved = this.load();
            // only keys we still know about, so old or renamed settings drop out //
            for (let key in defaults) {
                if (saved && Object.prototype.hasOwnProperty.call(saved, key) && saved[key] !== null) {
                    this.current[key] = saved[key];
                }
            }
            window.addEventListener("pagehide", () => this.flush());
        }
    }

    public get state(): Readonly<T> {
        return this.current;
    }

    public set(patch: Partial<T>): void {
        let changed = (Object.keys(patch) as (keyof T)[]).filter(key => this.current[key] !== patch[key]);
        if (!changed.length) {
            return;
        }

        this.current = { ...this.current, ...patch };
        this.scheduleSave();

        for (let listener of this.listeners.slice()) {
            if (!listener.keys || listener.keys.some(key => changed.includes(key))) {
                listener.fn(this.current, changed);
            }
        }
    }

    // returns an unsubscribe function //
    public subscribe(keys: (keyof T)[] | null, fn: Listener<T>): () => void {
        let entry = { keys, fn };
        this.listeners.push(entry);
        return () => {
            this.listeners = this.listeners.filter(l => l !== entry);
        };
    }

    private load(): Partial<T> | null {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey));
        } catch {
            return null;
        }
    }

    // saved a beat after the last change, so slider drags don't write on every pixel //
    private scheduleSave(): void {
        if (!this.storageKey) {
            return;
        }
        clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.flush(), 250);
    }

    public flush(): void {
        if (!this.storageKey) {
            return;
        }
        clearTimeout(this.saveTimer);
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.current));
        } catch {
            // private mode or full storage, settings just won't stick //
        }
    }
}
