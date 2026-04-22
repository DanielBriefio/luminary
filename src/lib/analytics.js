import posthog from 'posthog-js';

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
