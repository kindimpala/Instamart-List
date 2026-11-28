import { ATTRIBUTION_BRAND, ATTRIBUTION_PREFIX, ATTRIBUTION_TEXT } from '../../shared/brand';
import { INSTAMART_LOGO_URL } from './logo';

interface Props {
  variant?: 'standard' | 'compact';
  /** Logo only (no text). The image then carries the accessible label. */
  logoOnly?: boolean;
  className?: string;
}

/**
 * The one and only "Powered by Instamart" badge. Identifies the service; it is
 * not interactive (no link, no button, no click handler).
 * Sizes/spacing live in global.css (.pbi*) and are rem-based with px minimums.
 */
export function PoweredByInstamart({ variant = 'standard', logoOnly = false, className = '' }: Props) {
  const logo = INSTAMART_LOGO_URL ? (
    <img
      className="pbi__logo"
      src={INSTAMART_LOGO_URL}
      width={variant === 'standard' ? 32 : 24}
      height={variant === 'standard' ? 32 : 24}
      draggable={false}
      {...(logoOnly ? { alt: ATTRIBUTION_TEXT } : { alt: '', 'aria-hidden': true })}
    />
  ) : null;

  return (
    <div className={`pbi pbi--${variant} ${className}`.trim()} data-testid={`pbi-${variant}`}>
      {logo}
      {(!logoOnly || !logo) && (
        <span className="pbi__text">
          {ATTRIBUTION_PREFIX}
          <strong>{ATTRIBUTION_BRAND}</strong>
        </span>
      )}
    </div>
  );
}
