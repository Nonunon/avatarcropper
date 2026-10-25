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
    decorations: (DiscordDecoration & { asset: string, category?: string })[]
    nameplates: (DiscordNameplate & { category?: string })[]
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

// ids match Discord's DisplayNameFont enum, names are the labels Discord shows.
// family is Discord's own font-family name (served by `npm run discord:fonts`) with a
// Google Fonts fallback for when that hasn't been run. local marks the faces that only
// look right once the real file is there (not on Google Fonts)
export const discordFonts: { id: number, name: string, font: string, family: string, local?: boolean }[] = [
    { id: 11, name: 'gg sans', font: 'gg sans', family: "'gg sans', 'Noto Sans', sans-serif", local: true },
    { id: 1, name: 'Bangers', font: 'Bangers', family: "'Bangers', cursive" },
    { id: 2, name: 'BioRhyme', font: 'BioRhyme', family: "'BioRhyme', serif" },
    { id: 3, name: 'Sakura', font: 'Cherry Bomb One', family: "'Sakura', 'Cherry Bomb One', cursive" },
    { id: 4, name: 'Jellybean', font: 'Chicle', family: "'Jellybean', 'Chicle', cursive" },
    { id: 5, name: 'Compagnon', font: 'Compagnon', family: "'Compagnon', 'Courier Prime', monospace", local: true },
    { id: 6, name: 'Modern', font: 'MuseoModerno', family: "'Modern', 'MuseoModerno', sans-serif" },
    { id: 7, name: 'Medieval', font: 'Néo-Castel', family: "'Medieval', 'MedievalSharp', serif", local: true },
    { id: 8, name: '8Bit', font: 'Pixelify Sans', family: "'8Bit', 'Pixelify Sans', monospace" },
    { id: 9, name: 'Ribes', font: 'Ribes', family: "'Ribes', 'Poiret One', sans-serif", local: true },
    { id: 10, name: 'Vampyre', font: 'Sinistre', family: "'Vampyre', 'Creepster', cursive", local: true },
    { id: 12, name: 'Tempo', font: 'Zilla Slab', family: "'Tempo', 'Zilla Slab', serif" },
    { id: 13, name: 'Monkey Bars', font: 'Playpen Sans', family: "'Monkey Bars', 'Playpen Sans', cursive" },
    { id: 14, name: 'Mainframe', font: 'Orbitron', family: "'Mainframe', 'Orbitron', sans-serif" },
    { id: 15, name: 'Headbang', font: 'New Rocker', family: "'Headbang', 'New Rocker', cursive" },
    { id: 16, name: 'Journal', font: 'Kalam', family: "'Journal', 'Kalam', cursive" },
]

// ids match Discord's DisplayNameEffect enum //
export const discordEffects: { id: number, name: string, colors: number }[] = [
    { id: 1, name: 'Solid', colors: 1 },
    { id: 2, name: 'Gradient', colors: 2 },
    { id: 3, name: 'Neon', colors: 1 },
    { id: 4, name: 'Toon', colors: 1 },
    { id: 5, name: 'Pop', colors: 1 },
    { id: 6, name: 'Gummy', colors: 5 },
    { id: 7, name: 'Prism', colors: 5 },
]

export const discordSwatches: string[] = [
    '#ffffff', '#b5bac1', '#ff4d4d', '#ff7a45', '#ffb020', '#ffe14d',
    '#7dff6a', '#2ecc71', '#1abc9c', '#4dd9ff', '#3b82f6', '#5865f2',
    '#8b5cf6', '#c084fc', '#ff6ec7', '#eb459e', '#ffc345', '#000000',
]

// families the local fonts.css provides, filled in by loadDiscordFonts //
export const localFonts: Set<string> = new Set()

let fontsLoading: Promise<void> = null

function addStylesheet(href: string): void {
    let link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
}

// pulled in lazily so people who never open the Discord preview don't download fonts //
export function loadDiscordFonts(): Promise<void> {
    if (!fontsLoading) {
        fontsLoading = fetchDiscordJson<{ families: string[] }>('fonts/fonts.json').then(manifest => {
            if (manifest) {
                manifest.families.forEach(f => localFonts.add(f))
                addStylesheet('discord/fonts/fonts.css')
            }

            // google fallbacks for whatever the local set doesn't cover //
            let fallbacks: [string, string][] = [
                ['gg sans', 'Noto+Sans:wght@600'], ['Bangers', 'Bangers'], ['BioRhyme', 'BioRhyme:wght@700'],
                ['Sakura', 'Cherry+Bomb+One'], ['Jellybean', 'Chicle'], ['Compagnon', 'Courier+Prime:wght@700'],
                ['Modern', 'MuseoModerno:wght@700'], ['Medieval', 'MedievalSharp'], ['8Bit', 'Pixelify+Sans:wght@600'],
                ['Ribes', 'Poiret+One'], ['Vampyre', 'Creepster'], ['Tempo', 'Zilla+Slab:wght@700'],
                ['Monkey Bars', 'Playpen+Sans:wght@600'], ['Mainframe', 'Orbitron:wght@700'],
                ['Headbang', 'New+Rocker'], ['Journal', 'Kalam:wght@700'],
            ]
            let missing = fallbacks.filter(([family]) => !localFonts.has(family)).map(([, query]) => 'family=' + query)
            if (missing.length) {
                addStylesheet('https://fonts.googleapis.com/css2?' + missing.join('&') + '&display=swap')
            }
        })
    }
    return fontsLoading
}

export function isStandIn(fontId: number): boolean {
    let font = discordFonts.find(f => f.id === fontId)
    return !!font && !!font.local && !localFonts.has(font.family.split("'")[1])
}

function mix(hex: string, other: string, amount: number): string {
    let a = parseInt(hex.slice(1), 16)
    let b = parseInt(other.slice(1), 16)
    let ch = (n: number, shift: number) => (n >> shift) & 255
    let out = [16, 8, 0].map(s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount))
    return '#' + out.map(n => n.toString(16).padStart(2, '0')).join('')
}

// approximations, Discord draws these in its own renderer //
export function applyNameStyle(el: HTMLElement, style: DiscordNameStyle): void {
    let font = discordFonts.find(f => f.id === style.font) || discordFonts[0]
    let colors = style.colors.length ? style.colors : ['#ffffff']
    let c1 = colors[0]
    let dark = mix(c1, '#000000', 0.55)

    el.style.cssText = ''
    el.style.fontFamily = font.family
    el.style.setProperty('font-synthesis', 'none')

    switch (style.effect) {
        case 2: // gradient
            el.style.backgroundImage = `linear-gradient(90deg, ${c1}, ${colors[1] || dark})`
            break
        case 3: // neon
            el.style.color = mix(c1, '#ffffff', 0.6)
            el.style.textShadow = `0 0 2px ${c1}, 0 0 6px ${c1}, 0 0 12px ${c1}`
            break
        case 4: // toon
            el.style.backgroundImage = `linear-gradient(180deg, ${mix(c1, '#ffffff', 0.35)} 30%, ${c1} 60%, ${mix(c1, '#000000', 0.25)})`
            el.style.filter = `drop-shadow(0 1px 0 ${dark}) drop-shadow(0 -1px 0 ${dark}) drop-shadow(1px 0 0 ${dark}) drop-shadow(-1px 0 0 ${dark})`
            break
        case 5: // pop
            el.style.color = c1
            el.style.textShadow = `2px 2px 0 ${dark}`
            break
        case 6: // gummy
            el.style.backgroundImage = `linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 45%), linear-gradient(90deg, ${colors.join(', ')}${colors.length === 1 ? ', ' + c1 : ''})`
            el.style.filter = `drop-shadow(0 1px 0 ${dark})`
            break
        case 7: // prism
            el.style.backgroundImage = `linear-gradient(90deg, ${colors.concat(c1).join(', ')})`
            el.style.backgroundSize = '200% 100%'
            el.style.animation = 'dpPrism 3s linear infinite'
            el.style.filter = `drop-shadow(0 0 3px ${mix(c1, '#000000', 0.2)})`
            break
        default: // solid
            el.style.color = c1
            break
    }

    el.classList.toggle('clipText', !!el.style.backgroundImage)
}

export async function fetchDiscordJson<T>(file: string): Promise<T | null> {
    try {
        let res = await fetch('discord/' + file, { cache: 'no-cache' })
        return res.ok ? await res.json() : null
    } catch {
        return null
    }
}
