import { Widget } from './widget'
import { Preview } from './preview'
import { CropView } from './cropview'
import { Point } from './point'
import { createElement, hideElement, showElement } from './util'
import { DiscordLook, applyNameStyle, loadDiscordFonts } from './discordlook'

// one avatar (live crop preview) with the decoration + status dot layered over it //
class DecoratedAvatar extends Widget {
    private decoration: HTMLImageElement

    constructor(size: number, cropView: CropView) {
        super('dpAvatar')
        this.container.style.width = this.container.style.height = size + 'px'

        let preview = new Preview(new Point(size), cropView)
        preview.container.style.height = size + 'px'
        preview.container.style.zIndex = ''

        // decorations are drawn at 1.2x the avatar, centered on it //
        this.decoration = <HTMLImageElement>createElement('img', 'dpDecoration')
        this.decoration.style.width = this.decoration.style.height = size * 1.2 + 'px'
        this.decoration.style.left = this.decoration.style.top = -size * 0.1 + 'px'
        this.decoration.draggable = false

        let status = createElement('div', 'dpStatus')
        let dot = Math.round(size * 0.3)
        status.style.width = status.style.height = dot + 'px'
        status.style.borderWidth = Math.max(2, Math.round(size * 0.06)) + 'px'

        this.appendChild(preview, this.decoration, status)
    }

    public setDecoration(src: string | null): void {
        if (src) {
            this.decoration.src = src
            showElement(this.decoration)
        } else {
            this.decoration.removeAttribute('src')
            hideElement(this.decoration)
        }
    }
}

export class DiscordProfile extends Widget {
    private bigAvatar: DecoratedAvatar
    private smallAvatar: DecoratedAvatar
    private bigName: HTMLElement
    private smallName: HTMLElement
    private username: HTMLElement
    private row: HTMLElement
    private plateVideo: HTMLVideoElement
    private plateImage: HTMLImageElement

    constructor(cropView: CropView) {
        super('discordPanel')

        this.createEvent('customize')
        this.createEvent('close')

        let header = createElement('div', 'dpHeader')
        let title = createElement('span', 'dpTitle')
        title.innerText = 'Discord Preview'
        let customize = createElement('button', 'dpButton')
        customize.innerText = 'Customize'
        customize.addEventListener('click', () => this.emitEvent('customize'))
        let close = createElement('button', 'dpButton dpClose')
        close.innerText = '✖'
        close.addEventListener('click', () => this.emitEvent('close'))
        header.appendChild(title)
        header.appendChild(customize)
        header.appendChild(close)
        this.makeDraggable(header)

        // profile popout //
        let card = createElement('div', 'dpCard')
        card.appendChild(createElement('div', 'dpBanner'))
        this.bigAvatar = new DecoratedAvatar(80, cropView)
        card.appendChild(this.bigAvatar.container)
        this.bigName = createElement('div', 'dpName dpBigName')
        this.username = createElement('div', 'dpUsername')
        card.appendChild(this.bigName)
        card.appendChild(this.username)

        // member list row, where nameplates show up //
        let list = createElement('div', 'dpList')
        let listLabel = createElement('div', 'dpListLabel')
        listLabel.innerText = 'ONLINE · 1'
        this.row = createElement('div', 'dpRow')
        this.plateImage = <HTMLImageElement>createElement('img', 'dpPlate')
        this.plateVideo = <HTMLVideoElement>createElement('video', 'dpPlate')
        this.plateVideo.muted = true
        this.plateVideo.loop = true
        this.plateVideo.autoplay = true
        this.plateVideo.playsInline = true
        this.smallAvatar = new DecoratedAvatar(32, cropView)
        this.smallName = createElement('div', 'dpName dpSmallName')
        this.row.appendChild(this.plateImage)
        this.row.appendChild(this.plateVideo)
        this.row.appendChild(this.smallAvatar.container)
        this.row.appendChild(this.smallName)
        list.appendChild(listLabel)
        list.appendChild(this.row)

        this.appendChild(header, card, list)
    }

    public show(): void {
        loadDiscordFonts()
        super.show()
    }

    public setLook(look: DiscordLook): void {
        let deco = look.decoration ? look.decoration.animated : null
        this.bigAvatar.setDecoration(deco)
        this.smallAvatar.setDecoration(deco)

        for (let el of [this.bigName, this.smallName]) {
            el.innerText = look.displayName || look.username || 'Display Name'
            applyNameStyle(el, look.nameStyle)
        }
        this.username.innerText = look.username || ''

        let plate = look.nameplate
        hideElement(this.plateVideo)
        hideElement(this.plateImage)
        this.row.classList.toggle('hasPlate', !!plate)
        if (plate && plate.video) {
            this.plateVideo.src = plate.video
            showElement(this.plateVideo)
            this.plateVideo.play().catch(() => { })
        } else if (plate && plate.static) {
            this.plateImage.src = plate.static
            showElement(this.plateImage)
        }
        if (!plate || !plate.video) {
            this.plateVideo.removeAttribute('src')
        }
    }

    private makeDraggable(handle: HTMLElement): void {
        handle.addEventListener('mousedown', (e: MouseEvent) => {
            if ((<HTMLElement>e.target).tagName === 'BUTTON') {
                return
            }
            e.preventDefault()
            let rect = this.container.getBoundingClientRect()
            let parent = this.container.offsetParent.getBoundingClientRect()
            let dx = e.clientX - rect.left
            let dy = e.clientY - rect.top

            let move = (e: MouseEvent) => {
                let x = Math.min(Math.max(0, e.clientX - dx - parent.left), parent.width - rect.width)
                let y = Math.min(Math.max(0, e.clientY - dy - parent.top), parent.height - 40)
                this.container.style.left = x + 'px'
                this.container.style.top = y + 'px'
                this.container.style.right = 'auto'
            }
            let up = () => {
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
        })
    }
}
