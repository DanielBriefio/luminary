import React from 'react';
import { T } from '../lib/constants';

// Catches uncaught render errors anywhere below in the tree. Without
// this, a single bad render blanks the entire app to a white page and
// users have no way to recover other than a hard refresh.
//
// Class component because hooks can't catch render-phase errors —
// React only exposes the lifecycle for class components.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface in dev console so the stack is still discoverable. In
    // production this is also a hook for Sentry / LogRocket / etc.
    // eslint-disable-next-line no-console
    console.error('App-level render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.bg, padding: '24px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          maxWidth: 480, width: '100%',
          background: T.w, border: `1px solid ${T.bdr}`,
          borderRadius: 16, padding: '32px 28px',
          boxShadow: '0 4px 24px rgba(0,0,0,.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 22, color: T.text, marginBottom: 8,
          }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: 13.5, color: T.mu, lineHeight: 1.6, marginBottom: 20,
          }}>
            Luminary hit an unexpected error. Reloading usually fixes it.
            If it keeps happening, let us know at <a
              href="mailto:hi@luminary.to" style={{ color: T.v, textDecoration: 'none' }}
            >hi@luminary.to</a>.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 22px', borderRadius: 22, border: 'none',
              background: T.v, color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >Reload</button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{
              marginTop: 20, padding: '12px 14px',
              background: T.s2, border: `1px solid ${T.bdr}`,
              borderRadius: 10, fontSize: 11, lineHeight: 1.5,
              color: T.ro, textAlign: 'left',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 240, overflowY: 'auto',
            }}>
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
