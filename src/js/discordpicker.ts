import { ClosableDialog } from './closabledialog'
import { createElement } from './util'
import {
    DiscordLook, DiscordCatalog, DiscordUserLook, DiscordNameStyle,
    discordFonts, discordEffects, discordSwatches, applyNameStyle, fetchDiscordJson,
} from './discordlook'

type Tab = 'decoration' | 'nameplate' | 'name' | 'users'

const syncHint = 'No catalog yet. Run this in the project folder, then reload:\n\nnpm run discord:catalog'
const usersHint = 'No synced users yet. Add your bot token to discord.config.json, then run:\n\nnpm run discord:users -- <user id>'

export class DiscordPicker extends ClosableDialog {
    private look: DiscordLook
    private catalog: DiscordCatalog | null = null
    private users: DiscordUserLook[] | null = null
    private loaded: boolean = false
    private tab: Tab = 'decoration'
    private tabButtons: Map<Tab, HTMLElement> = new Map()
    private body: HTMLElement
    private namePreview: HTMLElement

    constructor(look: DiscordLook) {
        super()
        this.container.classList.add('discordPicker')
        this.look = JSON.parse(JSON.stringify(look))

        this.createEvent('change')
        this.createEvent('openavatar')

        let title = createElement('h2')
        title.innerText = 'Discord Look'

        let tabs = createElement('div', 'dpTabs')
        let tabNames: [Tab, string][] = [
            ['decoration', 'Decoration'],
            ['nameplate', 'Nameplate'],
            ['name', 'Name Style'],
            ['users', 'Synced Users'],
        ]
        tabNames.forEach(([tab, label]) => {
            let b = createElement('button', 'dpTab')
            b.innerText = label
            b.addEventListener('click', () => this.setTab(tab))
            tabs.appendChild(b)
            this.tabButtons.set(tab, b)
        })

        this.body = createElement('div', 'dpBody')
        this.appendChild(title, tabs, this.body)
    }

    public async open(look: DiscordLook): Promise<void> {
        this.look = JSON.parse(JSON.stringify(look))
        this.show()
        if (!this.loaded) {
            this.loaded = true
            this.body.innerText = 'Loading...'
            this.catalog = await fetchDiscordJson<DiscordCatalog>('catalog.json')
            this.users = await fetchDiscordJson<DiscordUserLook[]>('users.json')
        }
        this.setTab(this.tab)
    }

    private commit(): void {
        this.emitEvent('change', JSON.parse(JSON.stringify(this.look)))
    }

    private setTab(tab: Tab): void {
        this.tab = tab
        this.tabButtons.forEach((b, t) => b.classList.toggle('toggled', t === tab))
        this.body.innerHTML = ''
        this.body.scrollTop = 0

        if (tab === 'decoration') this.buildDecorations()
        else if (tab === 'nameplate') this.buildNameplates()
        else if (tab === 'name') this.buildNameStyle()
        else this.buildUsers()
    }

    private hint(text: string): void {
        let p = createElement('p', 'dpHint')
        p.innerText = text
        this.body.appendChild(p)
    }

    private searchBox(onInput: (q: string) => void): HTMLInputElement {
        let input = <HTMLInputElement>createElement('input', 'dpSearch')
        input.type = 'text'
        input.placeholder = 'Search...'
        input.addEventListener('keydown', e => e.stopPropagation())
        input.addEventListener('input', () => onInput(input.value.trim().toLowerCase()))
        this.body.appendChild(input)
        return input
    }

    private buildDecorations(): void {
        if (!this.catalog) {
            return this.hint(syncHint)
        }

        let grid = createElement('div', 'dpGrid')
        let tiles: { el: HTMLElement, name: string }[] = []

        let select = (el: HTMLElement, value: DiscordLook['decoration']) => {
            this.look.decoration = value
            grid.querySelectorAll('.dpTile.toggled').forEach(t => t.classList.remove('toggled'))
            el.classList.add('toggled')
            this.commit()
        }

        let none = createElement('button', 'dpTile dpNone')
        none.innerText = 'None'
        none.classList.toggle('toggled', !this.look.decoration)
        none.addEventListener('click', () => select(none, null))
        grid.appendChild(none)

        this.catalog.decorations.forEach(d => {
            let tile = createElement('button', 'dpTile')
            let img = <HTMLImageElement>createElement('img')
            img.loading = 'lazy'
            img.src = d.thumb || d.static
            img.draggable = false
            let label = createElement('span', 'dpLabel')
            label.innerText = d.name
            tile.appendChild(img)
            tile.appendChild(label)
            tile.addEventListener('mouseenter', () => img.src = d.animated)
            tile.addEventListener('mouseleave', () => img.src = d.thumb || d.static)
            tile.classList.toggle('toggled', !!this.look.decoration && this.look.decoration.animated === d.animated)
            tile.addEventListener('click', () => select(tile, { name: d.name, animated: d.animated, static: d.static }))
            grid.appendChild(tile)
            tiles.push({ el: tile, name: d.name.toLowerCase() })
        })

        this.searchBox(q => tiles.forEach(t => t.el.style.display = t.name.includes(q) ? '' : 'none'))
        this.body.appendChild(grid)
    }

    private buildNameplates(): void {
        if (!this.catalog) {
            return this.hint(syncHint)
        }

        let list = createElement('div', 'dpPlateList')
        let tiles: { el: HTMLElement, name: string }[] = []

        let select = (el: HTMLElement, value: DiscordLook['nameplate']) => {
            this.look.nameplate = value
            list.querySelectorAll('.dpPlateTile.toggled').forEach(t => t.classList.remove('toggled'))
            el.classList.add('toggled')
            this.commit()
        }

        let none = createElement('button', 'dpPlateTile dpNone')
        none.innerText = 'None'
        none.classList.toggle('toggled', !this.look.nameplate)
        none.addEventListener('click', () => select(none, null))
        list.appendChild(none)

        this.catalog.nameplates.forEach(n => {
            let tile = createElement('button', 'dpPlateTile')
            if (n.static) {
                let img = <HTMLImageElement>createElement('img')
                img.loading = 'lazy'
                img.src = n.static
                img.draggable = false
                tile.appendChild(img)
            }
            let label = createElement('span', 'dpLabel')
            label.innerText = n.name
            tile.appendChild(label)

            // only spin up a video while hovered, 250 of them at once would be a lot //
            let video: HTMLVideoElement = null
            tile.addEventListener('mouseenter', () => {
                if (!n.video) return
                video = <HTMLVideoElement>createElement('video')
                video.muted = true
                video.loop = true
                video.autoplay = true
                video.playsInline = true
                video.src = n.video
                tile.insertBefore(video, label)
            })
            tile.addEventListener('mouseleave', () => {
                if (video) {
                    video.remove()
                    video = null
                }
            })

            tile.classList.toggle('toggled', !!this.look.nameplate && this.look.nameplate.name === n.name)
            tile.addEventListener('click', () => select(tile, { name: n.name, video: n.video, static: n.static }))
            list.appendChild(tile)
            tiles.push({ el: tile, name: n.name.toLowerCase() })
        })

        this.searchBox(q => tiles.forEach(t => t.el.style.display = t.name.includes(q) ? '' : 'none'))
        this.body.appendChild(list)
    }

    private buildNameStyle(): void {
        let style = this.look.nameStyle

        this.namePreview = createElement('div', 'dpNamePreview')
        let previewText = createElement('span', 'dpName')
        this.namePreview.appendChild(previewText)
        let refresh = () => {
            previewText.innerText = this.look.displayName || 'Display Name'
            applyNameStyle(previewText, style)
            this.commit()
        }
        this.body.appendChild(this.namePreview)

        let textField = (label: string, value: string, onChange: (v: string) => void) => {
            let row = createElement('label', 'dpField')
            let span = createElement('span')
            span.innerText = label
            let input = <HTMLInputElement>createElement('input', 'dpText')
            input.type = 'text'
            input.value = value
            input.addEventListener('keydown', e => e.stopPropagation())
            input.addEventListener('input', () => onChange(input.value))
            row.appendChild(span)
            row.appendChild(input)
            this.body.appendChild(row)
        }

        textField('Display Name', this.look.displayName, v => { this.look.displayName = v; refresh() })
        textField('Username', this.look.username, v => { this.look.username = v; this.commit() })

        let section = (text: string) => {
            let h = createElement('h3', 'dpSection')
            h.innerText = text
            this.body.appendChild(h)
        }

        section('Font')
        let fonts = createElement('div', 'dpChoices')
        discordFonts.forEach(f => {
            let b = createElement('button', 'dpChoice')
            b.innerText = f.name + (f.standIn ? '*' : '')
            b.style.fontFamily = f.family
            b.classList.toggle('toggled', style.font === f.id)
            b.addEventListener('click', () => {
                style.font = f.id
                fonts.querySelectorAll('.toggled').forEach(t => t.classList.remove('toggled'))
                b.classList.add('toggled')
                refresh()
            })
            fonts.appendChild(b)
        })
        this.body.appendChild(fonts)
        this.hint('* close stand-in, Discord\'s own font isn\'t freely available')

        section('Effect')
        let effects = createElement('div', 'dpChoices')
        let colorArea = createElement('div')
        discordEffects.forEach(fx => {
            let b = createElement('button', 'dpChoice')
            b.innerText = fx.name
            b.classList.toggle('toggled', style.effect === fx.id)
            b.addEventListener('click', () => {
                style.effect = fx.id
                effects.querySelectorAll('.toggled').forEach(t => t.classList.remove('toggled'))
                b.classList.add('toggled')
                buildColors()
                refresh()
            })
            effects.appendChild(b)
        })
        this.body.appendChild(effects)
        this.body.appendChild(colorArea)

        let buildColors = () => {
            colorArea.innerHTML = ''
            let fx = discordEffects.find(e => e.id === style.effect) || discordEffects[0]
            let count = fx.twoColors ? 2 : 1
            while (style.colors.length < count) {
                style.colors.push(style.colors.length ? '#5865f2' : '#ffffff')
            }
            for (let i = 0; i < count; i++) {
                colorArea.appendChild(this.colorPicker(fx.twoColors ? `Color ${i + 1}` : 'Color', style, i, refresh))
            }
        }

        buildColors()
        refresh()
    }

    // swatches + a hex box, in place of a native color input //
    private colorPicker(label: string, style: DiscordNameStyle, index: number, onChange: () => void): HTMLElement {
        let wrap = createElement('div', 'dpColor')
        let h = createElement('h3', 'dpSection')
        h.innerText = label
        let swatches = createElement('div', 'dpSwatches')
        let hex = <HTMLInputElement>createElement('input', 'dpText dpHex')
        hex.type = 'text'
        hex.value = style.colors[index]
        hex.maxLength = 7

        let mark = () => swatches.querySelectorAll('.dpSwatch').forEach((s: HTMLElement) => {
            s.classList.toggle('toggled', s.dataset.color === style.colors[index].toLowerCase())
        })

        discordSwatches.forEach(c => {
            let s = createElement('button', 'dpSwatch')
            s.style.backgroundColor = c
            s.dataset.color = c
            s.addEventListener('click', () => {
                style.colors[index] = c
                hex.value = c
                mark()
                onChange()
            })
            swatches.appendChild(s)
        })

        hex.addEventListener('keydown', e => e.stopPropagation())
        hex.addEventListener('input', () => {
            let v = hex.value.trim()
            if (!v.startsWith('#')) v = '#' + v
            if (/^#[0-9a-f]{6}$/i.test(v)) {
                style.colors[index] = v.toLowerCase()
                mark()
                onChange()
            }
        })

        mark()
        wrap.appendChild(h)
        wrap.appendChild(swatches)
        wrap.appendChild(hex)
        return wrap
    }

    private buildUsers(): void {
        if (!this.users || !this.users.length) {
            return this.hint(usersHint)
        }

        let list = createElement('div', 'dpUsers')
        this.users.forEach(u => {
            let row = createElement('div', 'dpUser')
            let avatar = <HTMLImageElement>createElement('img', 'dpUserAvatar')
            avatar.src = u.avatar
            let info = createElement('div', 'dpUserInfo')
            let name = createElement('div', 'dpName')
            name.innerText = u.displayName
            if (u.nameStyle) applyNameStyle(name, u.nameStyle)
            let meta = createElement('div', 'dpUserMeta')
            meta.innerText = [
                '@' + u.username,
                u.decoration ? u.decoration.name : null,
                u.nameplate ? u.nameplate.name : null,
            ].filter(Boolean).join(' · ')
            info.appendChild(name)
            info.appendChild(meta)

            let use = createElement('button', 'dpChoice')
            use.innerText = 'Use Look'
            use.addEventListener('click', () => {
                this.look.displayName = u.displayName
                this.look.username = u.username
                this.look.decoration = u.decoration
                this.look.nameplate = u.nameplate
                if (u.nameStyle) this.look.nameStyle = u.nameStyle
                this.commit()
                use.innerText = 'Applied!'
            })

            let open = createElement('button', 'dpChoice')
            open.innerText = 'Crop Avatar'
            open.addEventListener('click', async () => {
                let blob = await (await fetch(u.avatar)).blob()
                let ext = blob.type === 'image/gif' ? 'gif' : 'png'
                this.emitEvent('openavatar', new File([blob], `${u.username}.${ext}`, { type: blob.type }))
                this.hide()
            })

            row.appendChild(avatar)
            row.appendChild(info)
            row.appendChild(use)
            row.appendChild(open)
            list.appendChild(row)
        })
        this.body.appendChild(list)
    }
}
