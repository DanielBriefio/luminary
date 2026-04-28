import posthog from 'posthog-js';
import { getTierFromLumens } from './constants';

const KEY  = process.env.REACT_APP_POSTHOG_KEY;
const HOST = 'https://app.posthog.com';

let initialised = false;

export function initAnalytics() {
  if (!KEY || initialised) return;

  posthog.init(KEY, {
    api_host:                    HOST,
    opt_out_capturing_by_default: true,
    capture_pageview:             false,
    capture_pageleave:            false,
    disable_session_recording:    true,
    persistence:                  'localStorage',
    autocapture:                  false,
  });

  initialised = true;
}

export function optInAndIdentify(userId, properties = {}) {
  if (!KEY || !initialised) return;
  posthog.opt_in_capturing();
  posthog.identify(userId, properties);
}

export function optOutAndReset() {
  if (!KEY || !initialised) return;
  posthog.opt_out_capturing();
  posthog.reset();
}

export function capture(event, properties = {}) {
  if (!KEY || !initialised) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // never block app functionality
  }
}

export function capturePageview(screenName, properties = {}) {
  capture('$pageview', { screen: screenName, ...properties });
}

// Lumens analytics. Fires every time award_lumens is called from the UI.
// When prevLumens is provided (self-award only — we know the caller's own
// lumens_current_period before the award), also fires `tier_reached` when
// the award crosses a tier threshold. Cross-user awards (e.g. comment_received
// for the post owner) skip prevLumens so no tier event is emitted from the
// granter's session.
export function captureLumensEarned({ reason, amount, meta = {}, prevLumens }) {
  capture('lumens_earned', { reason, amount, ...meta });
  if (typeof prevLumens === 'number' && typeof amount === 'number') {
    const oldTier = getTierFromLumens(prevLumens);
    const newTier = getTierFromLumens(prevLumens + amount);
    if (oldTier !== newTier) {
      capture('tier_reached', { tier: newTier, lumens: prevLumens + amount });
    }
  }
}
