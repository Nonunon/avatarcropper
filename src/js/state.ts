import { Store } from "./store";
import { GradientInfo, defaultBorderPresets } from "./presets";
import { DiscordLook, defaultLook } from "./discordlook";

export interface Settings {
    previewSizes: number[]
    maskOpacity: number
    previewMode: 'circle' | 'square' | 'banner'
    outlinesEnabled: boolean
    banneroutlinesEnabled: boolean
    antialias: boolean
    dismissedTutorial: boolean
    dismissedCookie: boolean
    guidesEnabled: boolean
    resizeLock: boolean
    borderSize: number
    borderPresets: GradientInfo[]
    borderType: 'none' | 'solid' | 'gradient'
    borderColor: string
    borderGradient: GradientInfo
    discordPreview: boolean
    discordLook: DiscordLook
}

// everything the user can set, saved to localStorage under the same "settings" key as before //
export const settings = new Store<Settings>({
    previewSizes: [30, 40, 64, 128],
    maskOpacity: 0.5,
    previewMode: 'circle',
    outlinesEnabled: true,
    banneroutlinesEnabled: false,
    antialias: true,
    dismissedTutorial: false,
    dismissedCookie: false,
    guidesEnabled: true,
    resizeLock: false,
    borderSize: 0.05,
    borderPresets: defaultBorderPresets,
    borderType: 'none',
    borderColor: '#FFAA00',
    borderGradient: defaultBorderPresets[0],
    discordPreview: false,
    discordLook: defaultLook,
}, 'settings');

export const borderKeys: (keyof Settings)[] = ['borderType', 'borderSize', 'borderColor', 'borderGradient'];
