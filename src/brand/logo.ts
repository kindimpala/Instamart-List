/**
 * Resolves the supplied logo file if present. Using a glob means a missing file
 * does not break the build: the badge falls back to text only (and the Vite
 * plugin prints a loud warning). We never draw or substitute a logo.
 */
const found = import.meta.glob('../assets/brand/instamart-logo-square.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const INSTAMART_LOGO_URL: string | null = Object.values(found)[0] ?? null;

if (!INSTAMART_LOGO_URL && import.meta.env.DEV) {
  console.warn('[brand] src/assets/brand/instamart-logo-square.png is missing: rendering attribution text only.');
}
