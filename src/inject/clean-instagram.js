/*
 * Clean Instagram — injected into instagram.com inside Unscroll's in-app
 * browser on iOS (PRD FR-1, FR-10). Plain ES2017, no dependencies.
 *
 * This file is the single source of truth. `npm run gen:inject` turns it into
 * src/inject/script.generated.ts (a string), because Hermes release builds do
 * not keep function source text.
 *
 * Security notes:
 *  - The script only hides UI and redirects blocked routes. It never reads
 *    page content, cookies, form fields or messages, and makes no network calls.
 *  - The only data it sends to the app is a fixed-format message
 *    "unscroll:blocked:<surface>" which the app validates against an allowlist.
 *  - `cfg` is validated JSON built by buildInjectedScript(); it carries data only.
 */
// eslint-disable-next-line no-unused-expressions -- invoked by buildInjectedScript()
(function (cfg) {
  'use strict';
  if (window.__unscrollInstalled) return;
  // Only instagram.com itself: never touch other sites the view may load.
  if (!/^(www\.)?instagram\.com$/i.test(location.hostname)) return;
  Object.defineProperty(window, '__unscrollInstalled', { value: true });

  const SAFE_PATH = cfg.safePath;
  let lastPosted = 0;

  function post(surface) {
    let now = Date.now();
    if (now - lastPosted < 750) return; // rate-limit: one message per redirect
    lastPosted = now;
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage('unscroll:blocked:' + surface);
      }
    } catch (_e) {
      /* never break the page */
    }
  }

  function classify(pathname) {
    let p = String(pathname || '/').toLowerCase();
    for (let i = 0; i < cfg.rules.length; i++) {
      let r = cfg.rules[i];
      // A profile's Reels tab: /<user>/reels/
      if (r.surface === 'reels' && /^\/[^/]+\/reels(\/|$)/.test(p)) return r.surface;
      for (let j = 0; j < r.exact.length; j++) if (p === r.exact[j]) return r.surface;
      for (let k = 0; k < r.prefixes.length; k++) if (p.indexOf(r.prefixes[k]) === 0) return r.surface;
    }
    return null;
  }

  function blockedSurfaceFor(href) {
    let u;
    try {
      u = new URL(String(href), location.href);
    } catch (_e) {
      return null;
    }
    if (u.origin !== location.origin) return null;
    return classify(u.pathname);
  }

  function redirect(surface) {
    post(surface);
    if (location.pathname !== SAFE_PATH) location.replace(SAFE_PATH);
  }

  function check() {
    let s = classify(location.pathname);
    if (s) redirect(s);
  }

  // 1. Hide navigation entry points with CSS (covers elements added later too).
  function installStyle() {
    if (!cfg.hideSelectors.length) return;
    let style = document.createElement('style');
    style.setAttribute('data-unscroll', '1');
    style.textContent = cfg.hideSelectors.join(',\n') + ' { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  // 2. Intercept client-side route changes (Instagram is a single-page app).
  ['pushState', 'replaceState'].forEach(function (fn) {
    let orig = history[fn];
    if (typeof orig !== 'function') return;
    history[fn] = function (state, title, url) {
      if (url !== undefined && url !== null) {
        let s = blockedSurfaceFor(url);
        if (s) {
          redirect(s);
          return undefined;
        }
      }
      return orig.apply(this, arguments);
    };
  });
  window.addEventListener('popstate', check, true);

  // 3. Intercept clicks on links to blocked routes before the router sees them.
  document.addEventListener(
    'click',
    function (e) {
      let el = e.target;
      while (el && el !== document) {
        if (el.tagName === 'A' && el.getAttribute('href')) {
          let s = blockedSurfaceFor(el.getAttribute('href'));
          if (s) {
            e.preventDefault();
            e.stopImmediatePropagation();
            post(s);
          }
          return;
        }
        el = el.parentNode;
      }
    },
    true,
  );

  // 4. Safety net for route changes that bypass the History API.
  setInterval(check, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installStyle, { once: true });
    installStyle(); // also try immediately: documentElement exists before head
  } else {
    installStyle();
  }
  check();
});
