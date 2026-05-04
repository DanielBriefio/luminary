import { ORCID_CLIENT_ID, ORCID_AUTHORIZE_URL, ORCID_REDIRECT_URI } from './constants';

// Begins the ORCID OAuth flow. Generates a single-use random state,
// persists it in sessionStorage, and includes it in the authorize URL.
// On return, App.jsx checks that the `state` param matches the stored
// value before processing the orcid_token — this is what stops a
// CSRF attacker from tricking a logged-in user into binding the
// attacker's ORCID iD to the user's session.
//
// sessionStorage scope: per-tab, dropped on tab close. That's tighter
// than localStorage and matches the shape of an OAuth round-trip
// (one redirect away, then back to the same tab via the redirect URL).
export function startOrcidOAuth() {
  // crypto.randomUUID is widely available; fall back to Math.random
  // composition only as a last resort.
  const state =
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem('orcid_oauth_state', state); } catch {}
  const params = new URLSearchParams({
    client_id:     ORCID_CLIENT_ID,
    response_type: 'code',
    scope:         '/authenticate',
    redirect_uri:  ORCID_REDIRECT_URI,
    state,
  });
  window.location.href = `${ORCID_AUTHORIZE_URL}?${params}`;
}

// Returns true if the state we stored before the redirect matches the
// one returned via the callback. Single-use: deletes the stored value
// regardless of result so the same state can never be re-validated.
export function consumeOrcidOAuthState(returned) {
  let stored = '';
  try { stored = sessionStorage.getItem('orcid_oauth_state') || ''; } catch {}
  try { sessionStorage.removeItem('orcid_oauth_state'); } catch {}
  if (!stored || !returned) return false;
  return stored === returned;
}
