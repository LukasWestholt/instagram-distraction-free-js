# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two standalone Tampermonkey userscripts, no build step, no bundler:

- `instagram_distraction_free.user.js` — the main script. Strips ads/suggested content from Instagram, removes dark
  patterns (read receipts, notification nags, autoplay sound, etc.), and provides a settings UI.
- `ig_clean_healthcheck.user.js` — a companion script that verifies the main script's DOM selectors still resolve
  against the live site, and can auto-file a GitHub issue/PR when Instagram's markup breaks something.

Both files are self-contained IIFEs with a `// ==UserScript==` metadata header; there is nothing to compile. Users
install them directly via raw GitHub URLs (see `@updateURL`/`@downloadURL` in each header, and README installation
instructions).

## Commands

```fish
npm run lint          # eslint .
npm run lint:fix       # eslint . --fix
npm run format         # prettier --write .
npm run format:check   # prettier --check .
```

No test suite exists. Verification is manual: load the script in Tampermonkey and check behavior against
instagram.com, or run the health-check script and read its console/GitHub output.

- Formatting: 120-char line width (also enforced on Markdown, per `eslint.config.mjs` and `.prettierrc`), single
  quotes, 4-space indent, trailing commas es5.
- `eslint.config.mjs` scopes browser + Tampermonkey (`GM_*`, `unsafeWindow`) globals to `*.user.js` files only.
  `no-console` is intentionally off (heavy logging is part of the design — see below).

## Architecture: `instagram_distraction_free.user.js`

The script runs at `document-start` and layers several independent mechanisms, in this rough order (see the
`// === SECTION ===` banner comments in the file for exact boundaries):

1. **Config** — a single `DEFAULT_CONFIG` object of boolean/number toggles, merged with whatever's in
   `localStorage['ig_clean_config']` (`{ ...DEFAULT_CONFIG, ...stored }`, so new keys pick up defaults for existing
   users without a migration step). All feature branches downstream gate on `config.<key>`.
2. **Early intercepts** — patches `Notification.requestPermission` and `console.log` before Instagram's own bundle
   runs, since both must be overridden before the app initializes.
3. **Fetch/XHR interceptor** — a *single* wrapper around `window.fetch`/`XMLHttpRequest` handles all request-level
   blocking (error reports, client-event telemetry, DM read-receipt mutations) rather than chaining multiple
   independent hooks. DM read receipts are matched by the `X-FB-Friendly-Name` request header, not `doc_id`, because
   `doc_id` changes on every Instagram deploy and the friendly name doesn't.
4. **JSON data filtering (the core mechanism)** — `JSON.parse` and `Response.prototype.json` are both monkey-patched
   to run every parsed payload through `cleanFeedData()`. This is why ads/suggested posts disappear before React ever
   renders them, instead of flashing and then being hidden. `cleanFeedData()`:
   - calls `deepCleanFeedData()` for recursive structural cleaning (e.g. stripping like/view counts from arbitrary
     nesting depth),
   - then looks for known feed shapes by exact path (`xdt_api__v1__feed__timeline__connection.edges`, `result.data....`,
     `xdt_injected_story_units.ad_media_items`, `end_of_feed_demarcator` groups, etc.) and runs `filterEdges()` /
     `filterFeedItems()` against each.
   - Instagram exposes the *same* timeline connection under several different response envelopes (direct feed load,
     pagination, preloaded/SSR data, GraphQL `result.data`), so `cleanFeedData()` checks each envelope shape
     independently rather than assuming one canonical path. When adding a new filter rule, it usually needs to be
     applied at each of these call sites, not just one.
   - Detection signals used in `filterEdges`/`filterFeedItems`: `node.ad` / `is_sponsored` (sponsored),
     `node.suggested_users` / `node.explore_story` (suggested), `coauthor_producers` (collab), `is_ai_generated` /
     classifier score (AI content), `add_yours` sticker metadata (chain posts).
5. **Settings UI** (`createSettingsUI`, `openModal`) — builds the "IG Clean" button and its panel (desktop modal vs.
   mobile bottom sheet, based on the module-level `isMobile` check). Writes back to `config`/`saveConfig()` on
   change; most toggles require the "Close & Reload" action to take effect since they gate code paths set up at
   script init.
6. **CSS styles** — a single injected stylesheet holds all the blur/hide fallback rules, keyed off classes/attributes
   the DOM feature functions and blur fallback toggle.
7. **DOM feature functions** (`runDomFeatures` and friends: `muteVideos`, `autoDismissCookieBanner`,
   `hideNewPostsBanner`, `hideDownloadAppBanner`, `hideBoostButtons`, `hideStoriesBar`, ...) — each takes a `root`
   element and is re-run by the observers below whenever new content is injected, since Instagram is a SPA that
   mutates the DOM continuously rather than doing full page loads.
8. **Visual blur fallback** (`processArticle`, `blurArticle`, `scanForAdsInDOM`, `hideSuggestedProfileCards`) — a
   CSS-based safety net for content that slips past the JSON-layer filter (mainly pre-rendered/SSR content on first
   paint, before any fetch/JSON.parse call has happened for the script to intercept). The DOM-based sponsored/
   suggested label matching supports 17+ languages (see the multilingual label list — required because Instagram
   localizes "Sponsored"/"Suggested for you" per account language).
9. **Startup scans + `MutationObserver`s** — apply the DOM feature functions and blur fallback to content already on
   the page, then keep re-applying them as Instagram's SPA renders more.
10. **SPA navigation hook** — Instagram is a client-side-routed SPA, so `pushState`/`popState` are hooked to re-run
    redirects (`disableExplore`, `disableReels`, `redirectToFollowing`) and re-scan the DOM on route changes, since
    there's no full page load to trigger these naturally.

Session post limit (`checkSessionLimit`, `showSessionLimitWall`) is a separate concern layered on top of the above:
it counts posts processed and throws up a full-screen interstitial when `config.sessionPostLimit` is exceeded.

All logging is prefixed with `LOG_PREFIX` (`[IG-Clean vX.Y]`), which is kept in sync with the `@version` in the
userscript header — bump both together when releasing a change.

## Architecture: `ig_clean_healthcheck.user.js`

Runs at `document-idle` (after the main script and Instagram's own app have settled). Two independent check types:

- **DOM checks** (`DOM_CHECKS` array): CSS selectors the main script depends on, each tagged with an `active`
  predicate (e.g. only relevant `isHome`, or `isHome && isMobile`) so checks don't false-fail on pages where the
  element legitimately isn't expected.
- **Runtime checks**: read `ig_clean_config` from `localStorage` (the same key the main script writes) to know which
  features are actually enabled, then verify runtime behavior beyond simple selector presence.

On failure, `buildReport()` assembles a report and `ghFetch()` (built on `GM_xmlhttpRequest`, since `@connect
api.github.com` is required for cross-origin calls from a userscript) files a GitHub issue/PR against
`LukasWestholt/instagram-distraction-free-js` on `main`. A GitHub token is stored via `GM_setValue('ig_clean_gh_token',
...)`, set once from the browser console (`IG_HEALTH.setToken(...)`) — never hardcode a token into the script.
`REPORT_KEY` in `GM_setValue`/`GM_getValue` throttles reporting to once per day (`GM_getValue(REPORT_KEY, '') ===
today`).

## Notes for changes

- Both scripts must remain single-file, dependency-free IIFEs — there's no bundler, so no imports/npm deps can be
  used at runtime (`devDependencies` are lint/format tooling only).
- When adding a new content filter (sponsored/suggested/collab/AI/etc.), it typically needs three coordinated pieces:
  a `DEFAULT_CONFIG` toggle, a JSON-layer check inside `filterEdges`/`filterFeedItems`/`cleanFeedData`, and a CSS/DOM
  fallback for pre-rendered content — otherwise it'll flash on initial load even when nominally "removed".
- Because Instagram redeploys frequently and changes selectors/field names/`doc_id`s without notice, prefer matching
  on stable signals (structural JSON fields, `aria-label`, `X-FB-Friendly-Name` headers) over anything Instagram
  generates per-build (`doc_id`, hashed class names).
