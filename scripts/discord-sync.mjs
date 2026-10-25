// Pulls Discord collectibles data into public/discord/ for the Discord profile preview.
//
//   node scripts/discord-sync.mjs catalog [--download]   build the decoration + nameplate catalog
//   node scripts/discord-sync.mjs users [id ...]          snapshot users through your bot
//   node scripts/discord-sync.mjs all [--download]        both
//
// --limit=N keeps only the first N of each catalog list (handy for a quick test).
//
// Settings live in discord.config.json (gitignored, copy discord.config.example.json).
// The bot token only ever stays in this script, it is never written into public/.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'discord')
const CONFIG_PATH = path.join(ROOT, 'discord.config.json')
const CDN = 'https://cdn.discordapp.com'

const defaults = {
    botToken: '',
    userIds: [],
    apiBase: 'https://discord.com/api/v10',
    githubToken: '',
    mirror: {
        repo: 'JulesZYTB/discord-collectibles-downloader',
        branch: 'main',
        root: 'discord_collectibles',
    },
    download: false,
}

function loadConfig() {
    let config = { ...defaults }
    if (fs.existsSync(CONFIG_PATH)) {
        let file = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
        config = { ...config, ...file, mirror: { ...defaults.mirror, ...(file.mirror || {}) } }
    }
    if (process.env.DISCORD_BOT_TOKEN) {
        config.botToken = process.env.DISCORD_BOT_TOKEN
    }
    return config
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'))
    } catch {
        return fallback
    }
}

function writeJson(file, data) {
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(data, null, 1))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
}

function decorationUrl(asset, animated, size = 240) {
    return `${CDN}/avatar-decoration-presets/${asset}.png?size=${size}&passthrough=${animated}`
}

// downloads url into public/discord/<rel> (skipping files already there) and returns the page-relative path
async function download(url, rel) {
    let dest = path.join(OUT, rel)
    if (!fs.existsSync(dest)) {
        let res = await fetch(url)
        if (!res.ok) {
            throw new Error(`${res.status} for ${url}`)
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    }
    return 'discord/' + rel.split(path.sep).join('/')
}

async function pool(items, size, fn) {
    let i = 0
    let done = 0
    let workers = Array.from({ length: size }, async () => {
        while (i < items.length) {
            let item = items[i++]
            try {
                await fn(item)
            } catch (e) {
                console.warn('  skipped:', e.message)
            }
            done++
            if (done % 50 === 0 || done === items.length) {
                console.log(`  ${done}/${items.length}`)
            }
        }
    })
    await Promise.all(workers)
}

async function fetchMirrorTree(config) {
    let { repo, branch } = config.mirror
    let headers = { 'User-Agent': 'avatarcropper-discord-sync' }
    if (config.githubToken) {
        headers.Authorization = `Bearer ${config.githubToken}`
    }
    let res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, { headers })
    if (!res.ok) {
        throw new Error(`GitHub tree request failed (${res.status}). Is ${repo}@${branch} still up?`)
    }
    let tree = await res.json()
    if (tree.truncated) {
        console.warn('GitHub truncated the tree, the catalog may be incomplete.')
    }
    return tree.tree.filter(x => x.type === 'blob').map(x => x.path)
}

function groupByItem(paths, root, category) {
    let prefix = `${root}/${category}/`
    let items = new Map()
    for (let p of paths) {
        if (!p.startsWith(prefix)) continue
        let [name, ...rest] = p.slice(prefix.length).split('/')
        if (!items.has(name)) items.set(name, [])
        items.get(name).push({ path: p, file: rest.join('/') })
    }
    return items
}

async function buildCatalog(config, doDownload, limit) {
    console.log(`Reading mirror ${config.mirror.repo}...`)
    let paths = await fetchMirrorTree(config)
    let { repo, branch, root } = config.mirror
    let raw = p => `https://raw.githubusercontent.com/${repo}/${branch}/${p.split('/').map(encodeURIComponent).join('/')}`

    let decorations = []
    for (let [name, files] of groupByItem(paths, root, 'Avatar_Decorations')) {
        let asset = null
        let sku = null
        for (let { file } of files) {
            let a = file.match(/_((?:a_)?[0-9a-f]{32})\.png$/)
            if (a) asset = a[1]
            let s = file.match(/_static_(\d{17,20})\.png$/)
            if (s) sku = s[1]
        }
        if (!asset) continue
        decorations.push({
            name,
            asset,
            sku,
            animated: decorationUrl(asset, true),
            static: decorationUrl(asset, false),
            thumb: decorationUrl(asset, false, 96),
        })
    }

    let nameplates = []
    for (let [name, files] of groupByItem(paths, root, 'Nameplates')) {
        let find = re => files.find(f => re.test(f.file))
        let video = find(/^Animated\/.*_video_path.*\.webm$/) || find(/^Video\/.*\.webm$/)
        let still = find(/^Static\/.*_static_image_path.*\.png$/) || find(/^Static\/.*\.png$/)
        if (!video && !still) continue
        let sku = (files.map(f => f.file.match(/_(\d{17,20})\.(?:png|webm)$/)).find(Boolean) || [])[1] || null
        nameplates.push({
            name,
            sku,
            video: video ? raw(video.path) : null,
            static: still ? raw(still.path) : null,
        })
    }

    decorations.sort((a, b) => a.name.localeCompare(b.name))
    nameplates.sort((a, b) => a.name.localeCompare(b.name))
    if (limit) {
        decorations = decorations.slice(0, limit)
        nameplates = nameplates.slice(0, limit)
    }
    console.log(`Found ${decorations.length} decorations and ${nameplates.length} nameplates.`)

    if (doDownload) {
        console.log('Downloading decorations...')
        await pool(decorations, 8, async d => {
            d.animated = await download(d.animated, path.join('assets', 'decorations', `${d.asset}.png`))
            d.static = await download(d.static, path.join('assets', 'decorations', `${d.asset}_static.png`))
            d.thumb = d.static
        })
        console.log('Downloading nameplates...')
        await pool(nameplates, 8, async n => {
            let base = path.join('assets', 'nameplates', slug(n.name))
            if (n.video) n.video = await download(n.video, base + '.webm')
            if (n.static) n.static = await download(n.static, base + '.png')
        })
    }

    writeJson('catalog.json', {
        source: `https://github.com/${repo}`,
        syncedAt: new Date().toISOString(),
        local: doDownload,
        decorations,
        nameplates,
    })
    console.log('Wrote public/discord/catalog.json')
}

async function discordGet(config, route) {
    for (;;) {
        let res = await fetch(config.apiBase + route, {
            headers: {
                Authorization: `Bot ${config.botToken}`,
                'User-Agent': 'DiscordBot (https://github.com/sapic/avatarcropper, 1.0)',
            },
        })
        if (res.status === 429) {
            let body = await res.json().catch(() => ({}))
            await sleep(((body.retry_after || 1) * 1000) + 100)
            continue
        }
        if (!res.ok) {
            throw new Error(`Discord ${route} returned ${res.status}`)
        }
        return res.json()
    }
}

function colorHex(n) {
    return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6)
}

async function syncUsers(config, ids) {
    if (!config.botToken) {
        throw new Error('No botToken set. Put it in discord.config.json (see discord.config.example.json).')
    }
    if (!ids.length) {
        throw new Error('No user ids given. Pass them as arguments or list them in "userIds" in discord.config.json.')
    }

    let catalog = readJson('catalog.json', { decorations: [], nameplates: [] })
    let users = readJson('users.json', [])

    for (let id of ids) {
        console.log(`Fetching user ${id}...`)
        let u = await discordGet(config, `/users/${id}`)
        let dir = path.join('assets', 'users', id)

        let avatar
        if (u.avatar) {
            let ext = u.avatar.startsWith('a_') ? 'gif' : 'png'
            avatar = await download(`${CDN}/avatars/${id}/${u.avatar}.${ext}?size=512`, path.join(dir, `avatar-${u.avatar}.${ext}`))
        } else {
            let index = Number((BigInt(id) >> 22n) % 6n)
            avatar = await download(`${CDN}/embed/avatars/${index}.png`, path.join(dir, `avatar-default-${index}.png`))
        }

        let decoration = null
        if (u.avatar_decoration_data && u.avatar_decoration_data.asset) {
            let asset = u.avatar_decoration_data.asset
            let known = catalog.decorations.find(d => d.asset === asset)
            decoration = {
                name: known ? known.name : 'Current decoration',
                animated: await download(decorationUrl(asset, true), path.join(dir, `decoration-${asset}.png`)),
                static: await download(decorationUrl(asset, false), path.join(dir, `decoration-${asset}_static.png`)),
            }
        }

        let nameplate = null
        let np = u.collectibles && u.collectibles.nameplate
        if (np && np.asset) {
            let known = catalog.nameplates.find(n => n.sku && n.sku === np.sku_id)
            let key = slug(np.asset)
            nameplate = {
                name: known ? known.name : (np.label || 'Current nameplate'),
                palette: np.palette || null,
                video: await download(`${CDN}/assets/collectibles/${np.asset}asset.webm`, path.join(dir, `nameplate-${key}.webm`)),
                static: await download(`${CDN}/assets/collectibles/${np.asset}static.png`, path.join(dir, `nameplate-${key}.png`)),
            }
        }

        // not documented for bots yet, so this only fills in if Discord sends it
        let styles = u.display_name_styles
        let nameStyle = styles ? {
            font: styles.font_id,
            effect: styles.effect_id,
            colors: (styles.colors || []).map(colorHex),
        } : null

        let look = {
            id,
            username: u.username,
            displayName: u.global_name || u.username,
            avatar,
            decoration,
            nameplate,
            nameStyle,
            syncedAt: new Date().toISOString(),
        }
        users = users.filter(x => x.id !== id).concat(look)
        console.log(`  ${look.displayName}: decoration ${decoration ? 'yes' : 'no'}, nameplate ${nameplate ? 'yes' : 'no'}, name style ${nameStyle ? 'yes' : 'no'}`)
    }

    writeJson('users.json', users)
    console.log('Wrote public/discord/users.json')
}

async function main() {
    let [command = 'catalog', ...args] = process.argv.slice(2)
    let flags = args.filter(a => a.startsWith('--'))
    let rest = args.filter(a => !a.startsWith('--'))
    let config = loadConfig()
    let doDownload = flags.includes('--download') || config.download
    let limit = parseInt((flags.find(f => f.startsWith('--limit=')) || '').split('=')[1]) || 0

    if (command === 'catalog' || command === 'all') {
        await buildCatalog(config, doDownload, limit)
    }
    if (command === 'users' || command === 'all') {
        await syncUsers(config, rest.length ? rest : config.userIds)
    }
    if (!['catalog', 'users', 'all'].includes(command)) {
        console.log('Usage: node scripts/discord-sync.mjs <catalog|users|all> [--download] [user ids...]')
        process.exitCode = 1
    }
}

main().catch(e => {
    console.error(e.message)
    process.exitCode = 1
})
