import { PRODUCT_NAME, WELCOME_DESCRIPTION, WELCOME_HEADLINE } from '../../shared/brand';
import { PoweredByInstamart } from '../brand/PoweredByInstamart';
import { ErrorBanner } from '../components/ui';

export function WelcomeScreen({ mode, message }: { mode: 'stub' | 'staging' | 'production'; message: string | null }) {
  return (
    <main className="welcome" data-testid="welcome-screen">
      <p className="small muted" style={{ margin: 0, fontWeight: 600 }}>
        {PRODUCT_NAME}
      </p>
      <h1>{WELCOME_HEADLINE}</h1>
      <p>{WELCOME_DESCRIPTION}</p>
      <div className="pbi-row">
        <PoweredByInstamart variant="standard" />
      </div>
      {message && <ErrorBanner message={message} />}
      {/* Sign-in is its own control, outside the badge's clear space. */}
      <a className="btn btn--primary btn--block" href="/auth/login" style={{ textDecoration: 'none', marginTop: '0.5rem' }}>
        {mode === 'stub' ? 'Continue in demo mode' : 'Sign in with your Swiggy account'}
      </a>
      <p className="disclaimer">
        {PRODUCT_NAME} is an independent app that uses Instamart’s ordering service. It is not an official Swiggy app.
        {mode === 'stub' && ' Demo mode uses sample products and never places real orders.'}
      </p>
    </main>
  );
}
