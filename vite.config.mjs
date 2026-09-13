/* eslint-disable no-process-env */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const base = process.env.NETLIFY === 'true' ? '/' : '/MHWBuilder/';

const chunkForModule = id => {
    if (id.includes('/src/data/')) { return 'game-data'; }
    if (!id.includes('/node_modules/')) { return undefined; }
    if (id.includes('/@mui/') || id.includes('/@emotion/')) {
        return 'ui-vendor';
    }
    if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
        return 'react-vendor';
    }
    return 'vendor';
};

export default defineConfig(({ mode }) => ({
    base: mode === 'desktop' ? './' : base,
    plugins: [react({ include: /\.[jt]sx?$/ })],
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: chunkForModule
            }
        }
    },
    worker: {
        format: 'es',
        rollupOptions: {
            output: {
                manualChunks: chunkForModule
            }
        }
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.js',
        css: true
    }
}));
