import { defineConfig } from 'vite'

// the page lives in src/, static files (gif worker, favicons, synced Discord data) in public/ //
export default defineConfig({
    root: 'src',
    base: './',
    publicDir: '../public',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        target: 'es2020',
    },
    server: {
        port: 1234,
    },
})
