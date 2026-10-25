// shared types + helpers for the Discord profile preview //

export interface DiscordDecoration {
    name: string
    animated: string
    static: string
    thumb?: string
}

export interface DiscordNameplate {
    name: string
    video: string | null
    static: string | null
    palette?: string | null
}

export interface DiscordNameStyle {
    font: number
    effect: number
    colors: string[]
}

export interface DiscordLook {
    displayName: string
    username: string
    decoration: DiscordDecoration | null
    nameplate: DiscordNameplate | null
    nameStyle: DiscordNameStyle
}

export interface DiscordCatalog {
    decorations: (DiscordDecoration & { asset: string })[]
    nameplates: DiscordNameplate[]
}

export interface DiscordUserLook {
    id: string
    username: string
    displayName: string
    avatar: string
    decoration: DiscordDecoration | null
    nameplate: DiscordNameplate | null
    nameStyle: DiscordNameStyle | null
}

export const defaultLook: DiscordLook = {
    displayName: 'Display Name',
    username: 'username',
    decoration: null,
    nameplate: null,
    nameStyle: { font: 11, effect: 1, colors: ['#ffffff'] },
}

// ids match Discord's DisplayNameFont enum. stand-ins are free fonts that look close
// to Discord's own (gg sans and the Velvetyne faces aren't on Google Fonts)
export const discordFonts: { id: number, name: string, family: string, standIn?: boolean }[] = [
    { id: 11, name: 'Default', family: "'Noto Sans', sans-serif", standIn: true },
    { id: 1, name: 'Bangers', family: "'Bangers', cursive" },
    { id: 2, name: 'BioRhyme', family: "'BioRhyme', serif" },
    { id: 3, name: 'Cherry Bomb One', family: "'Cherry Bomb One', cursive" },
    { id: 4, name: 'Chicle', family: "'Chicle', cursive" },
    { id: 5, name: 'Compagnon', family: "'Courier Prime', monospace", standIn: true },
    { id: 6, name: 'MuseoModerno', family: "'MuseoModerno', sans-serif" },
    { id: 7, name: 'Néo-Castel', family: "'MedievalSharp', serif", standIn: true },
    { id: 8, name: 'Pixelify', family: "'Pixelify Sans', monospace" },
    { id: 9, name: 'Ribes', family: "'Poiret One', sans-serif", standIn: true },
    { id: 10, name: 'Sinistre', family: "'Creepster', cursive", standIn: true },
    { id: 12, name: 'Zilla Slab', family: "'Zilla Slab', serif" },
]

// ids match Discord's DisplayNameEffect enum //
export const discordEffects: { id: number, name: string, twoColors: boolean }[] = [
    { id: 1, name: 'Solid', twoColors: false },
    { id: 2, name: 'Gradient', twoColors: true },
    { id: 3, name: 'Neon', twoColors: false },
    { id: 4, name: 'Toon', twoColors: true },
    { id: 5, name: 'Pop', twoColors: true },
    { id: 6, name: 'Glow', twoColors: true },
]

export const discordSwatches: string[] = [
    '#ffffff', '#b5bac1', '#ff4d4d', '#ff7a45', '#ffb020', '#ffe14d',
    '#7dff6a', '#2ecc71', '#1abc9c', '#4dd9ff', '#3b82f6', '#5865f2',
    '#8b5cf6', '#c084fc', '#ff6ec7', '#eb459e', '#ffc345', '#000000',
]

let fontsLoaded = false

// pulled in lazily so people who never open the Discord preview don't download fonts //
export function loadDiscordFonts(): void {
    if (fontsLoaded) {
        return
    }
    fontsLoaded = true

    let families = [
        'Noto+Sans:wght@600', 'Bangers', 'BioRhyme:wght@700', 'Cherry+Bomb+One', 'Chicle',
        'Courier+Prime:wght@700', 'MuseoModerno:wght@700', 'MedievalSharp', 'Pixelify+Sans:wght@600',
        'Poiret+One', 'Creepster', 'Zilla+Slab:wght@700',
    ]
    let link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?' + families.map(f => 'family=' + f).join('&') + '&display=swap'
    document.head.appendChild(link)
}

function mix(hex: string, other: string, amount: number): string {
    let a = parseInt(hex.slice(1), 16)
    let b = parseInt(other.slice(1), 16)
    let ch = (n: number, shift: number) => (n >> shift) & 255
    let out = [16, 8, 0].map(s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount))
    return '#' + out.map(n => n.toString(16).padStart(2, '0')).join('')
}

export function applyNameStyle(el: HTMLElement, style: DiscordNameStyle): void {
    let font = discordFonts.find(f => f.id === style.font) || discordFonts[0]
    let c1 = style.colors[0] || '#ffffff'
    let c2 = style.colors[1] || mix(c1, '#000000', 0.45)

    el.style.cssText = ''
    el.style.fontFamily = font.family

    switch (style.effect) {
        case 2: // gradient
            el.style.backgroundImage = `linear-gradient(90deg, ${c1}, ${c2})`
            el.classList.add('clipText')
            break
        case 3: // neon
            el.style.color = mix(c1, '#ffffff', 0.6)
            el.style.textShadow = `0 0 2px ${c1}, 0 0 6px ${c1}, 0 0 12px ${c1}`
            break
        case 4: // toon
            el.style.backgroundImage = `linear-gradient(180deg, ${c1} 35%, ${c2})`
            el.style.filter = `drop-shadow(0 1px 0 ${mix(c2, '#000000', 0.5)}) drop-shadow(0 -1px 0 ${mix(c2, '#000000', 0.5)})`
            el.classList.add('clipText')
            break
        case 5: // pop
            el.style.color = c1
            el.style.textShadow = `2px 2px 0 ${c2}`
            break
        case 6: // glow
            el.style.backgroundImage = `linear-gradient(90deg, ${c1}, ${c2}, ${c1})`
            el.style.filter = `drop-shadow(0 0 4px ${mix(c1, '#000000', 0.1)})`
            el.classList.add('clipText')
            break
        default: // solid
            el.style.color = c1
            break
    }

    if (!el.style.backgroundImage) {
        el.classList.remove('clipText')
    }
}

export async function fetchDiscordJson<T>(file: string): Promise<T | null> {
    try {
        let res = await fetch('discord/' + file, { cache: 'no-cache' })
        return res.ok ? await res.json() : null
    } catch {
        return null
    }
}
