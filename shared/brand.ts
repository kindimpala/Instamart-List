/**
 * Single source of truth for product naming and the mandatory Instamart attribution.
 * Never hand-write "Powered by Instamart" anywhere else: import from here.
 */

/** The name of this product (shown in welcome copy). */
export const PRODUCT_NAME = 'Instamart Lists';

/** Exact attribution phrase required by Swiggy's attribution guidelines. */
export const ATTRIBUTION_TEXT = 'Powered by Instamart';

/** The two parts rendered visually: regular "Powered by " + bold "Instamart". */
export const ATTRIBUTION_PREFIX = 'Powered by ';
export const ATTRIBUTION_BRAND = 'Instamart';

export const WELCOME_HEADLINE = 'Shop groceries with Instamart';
export const WELCOME_DESCRIPTION = `Find everyday essentials and place your order through Instamart, right here in ${PRODUCT_NAME}.`;

/**
 * For any channel that can't display images (API text, clipboard/export,
 * toasts, screen-reader announcements). Appends the full attribution line once.
 */
export function withAttribution(text: string): string {
  const trimmed = text.replace(/\s+$/, '');
  if (trimmed.endsWith(ATTRIBUTION_TEXT)) return trimmed;
  return trimmed.length ? `${trimmed}\n\n${ATTRIBUTION_TEXT}` : ATTRIBUTION_TEXT;
}
