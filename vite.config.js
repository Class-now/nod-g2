import { defineConfig } from 'vite';

// Relative paths so dist/ works from a sub-folder (GitHub Pages) and inside the .ehpk.
export default defineConfig({ base: './' });
