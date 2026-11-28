import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import path from 'node:path';

const LOGO = path.resolve(import.meta.dirname, 'src/assets/brand/instamart-logo-square.png');

/** Loud warning if the supplied Instamart logo is missing. The UI then shows text only — never a substitute. */
function brandAssetCheck(): Plugin {
  return {
    name: 'brand-asset-check',
    buildStart() {
      if (!existsSync(LOGO)) {
        const bar = '!'.repeat(78);
        this.warn(
          `\n${bar}\n  MISSING BRAND ASSET: src/assets/brand/instamart-logo-square.png\n  The "Powered by Instamart" badge will render TEXT ONLY.\n  Drop in the supplied logo file. Do not draw or substitute a logo.\n${bar}`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), brandAssetCheck()],
  build: {
    // Never inline the logo as base64: ship the supplied file byte-for-byte.
    assetsInlineLimit: 0,
    outDir: 'dist',
  },
});
