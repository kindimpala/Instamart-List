# “Powered by Instamart” attribution

One component and one constant do all of it:

- `src/brand/PoweredByInstamart.tsx`: `<PoweredByInstamart variant="standard" | "compact" />`
- `shared/brand.ts`: `ATTRIBUTION_TEXT = "Powered by Instamart"`, `withAttribution(text)`, plus the welcome copy and `PRODUCT_NAME`

No other file hand-writes the phrase.

## Asset

- Only the supplied file: `src/assets/brand/instamart-logo-square.png` (512 × 512 PNG, sha256 `f87b916a4320cc2f0ba8da63e426755d8c60fe61ef3bf19e235a127f9c9ec2e0`).
- Vite is set to `assetsInlineLimit: 0`, so the file ships byte-for-byte (verified by test: the served file’s hash equals the source file’s).
- The image is rendered at 1:1 with `object-fit: contain` and no border-radius, border, shadow, filter or opacity. The rounded corners and padding are the artwork’s own.
- If the file is missing: the badge renders text only, the Vite build prints a loud warning, and `npm run check:brand` exits non-zero. No logo is ever drawn or substituted.

## Where the badge appears

| Place | Variant | Test |
|---|---|---|
| Welcome / login screen (below the description, above the separate sign-in button) | standard | `brand.spec.ts` |
| Persistent strip on every signed-in screen (chat and My lists), on its own row directly above the input bar, 8px+ gap to the input bar | standard | `brand.spec.ts` |
| “Found these for you” product results card | compact | `brand.spec.ts` |
| Order summary card | compact | `brand.spec.ts` |
| Order success / confirmation screen | standard | `brand.spec.ts` |
| Loading screen (before the session loads) | standard | visual |

## Dimensions (CSS px at default settings)

| Element | Standard | Compact | CSS |
|---|---|---|---|
| Logo | 32 × 32 | 24 × 24 | `width/height: max(32px, 2rem)` / `max(24px, 1.5rem)` |
| Text | 16px | 14px | `font-size: max(16px, 1rem)` / `max(14px, 0.875rem)` |
| Logo-to-text gap | 8px | 8px | `gap: max(8px, 0.5em)` |
| Clear space (all sides) | 8px | 8px | `padding: max(8px, 0.5rem)` on the badge’s own opaque box |

Everything is in rem/em with pixel floors, so the badge grows with text size and zoom and never drops below the minimums. At 200% text size the logo is 64 × 64 and the text 32px. The badge wraps (logo above text) rather than truncating. No ellipsis, no fixed heights, no clipping.

The clear space is the badge’s own padding on a solid surface, and tests check that no button, link, input, other badge, tag or list badge overlaps the badge box.

## Text

- Rendered as `Powered by ` (400) + `<strong>Instamart</strong>` (700).
- Spellings used across the UI: Swiggy, Instamart. Never “IM” or “InstaMart.”
- Welcome copy, verbatim: “Shop groceries with Instamart” / “Find everyday essentials and place your order through Instamart, right here in Instamart Lists.”
- The welcome screen says the app is independent and not an official Swiggy app. Delivery estimates, prices and availability are shown only from service responses.

## Contrast (measured by `tests/e2e/brand.spec.ts`)

| Theme | Text | Backing surface | Ratio |
|---|---|---|---|
| Light | `rgb(26, 26, 26)` | `rgb(255, 255, 255)` | **17.40 : 1** |
| Dark | `rgb(245, 243, 240)` | `rgb(31, 29, 27)` | **15.17 : 1** |

Both the strip and the in-card compact badge measure the same values. The backing surface is solid and opaque (`--pbi-surface`). Logo colours are never changed.

## Accessibility

- With text beside it, the logo has `alt=""` and `aria-hidden="true"`, so the phrase is read once (checked with Playwright’s aria snapshot).
- `logoOnly` mode (not used today) gives the image `alt="Powered by Instamart"`.
- The badge is a plain `div`: not a link or button, no tab stop, no click handler (the test inspects React props for any `on*` handler).
- Sign-in, Order, Confirm and other actions are separate labelled buttons with visible focus rings, outside the badge box.
- On a 375px viewport the strip badge is alone on its row (tested).
- Tested at 200% zoom (188px CSS viewport) and 200% text size: the phrase is complete, the logo is square and nothing is clipped.

## Text-only output

`withAttribution(text)` appends the full line “Powered by Instamart” once. It’s used for:

| Output | Where |
|---|---|
| Order confirmation text returned by `POST /api/order/confirm` (`order.message`) | `server/core/order.ts` |
| Exported / copied list text (`GET /api/lists/:id/export`, Copy button) | `server/core/app.ts`, `ListCard.tsx` |
| Toasts that report an order or a copy | `App.tsx`, `ListCard.tsx` |
| Screen-reader announcement of a placed order (live region gets `order.message`) | `App.tsx` |

Tests assert the phrase is present in the confirm response, the export text, the clipboard contents, the toast and the live region.
