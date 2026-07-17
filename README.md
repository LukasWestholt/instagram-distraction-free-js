# Instagram Distraction Free

Instagram Distraction Free - Remove suggested and sponsored posts, reels and explore tabs.

## Installation

### Desktop/Android (Chrome / Firefox)

1. Install the Tampermonkey browser extension:
   - [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Tampermonkey for Firefox Android](https://addons.mozilla.org/en-US/android/addon/tampermonkey/)

2. Click **[Install Script](https://raw.githubusercontent.com/LukasWestholt/instagram-distraction-free-js/main/instagram_distraction_free.user.js)** — Tampermonkey will intercept the link and show the install dialog.

### iOS (Safari)

1. **Install a userscript manager from the App Store**
   - [Tampermonkey](https://apps.apple.com/us/app/tampermonkey/id6738342400)
   - [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887)

2. **Enable the extension in Safari**
   - Open **Settings** → **Apps** → **Safari** → **Extensions**.
   - Tap your chosen extension and switch it on.
   - Under *Allow Extension to Read and Modify Webpages* set **instagram.com** (or *All Websites*) to **Allow**.

3. **Install the userscript**
   - Tap **[Install Script](https://raw.githubusercontent.com/LukasWestholt/instagram-distraction-free-js/main/instagram_distraction_free.user.js)** in Safari — the extension will intercept the link and show the install dialog.

4. **Open Instagram in Safari**
   - Go to `instagram.com` in Safari — the script activates automatically.
   - A small **IG Clean** button appears in the bottom-right corner for settings.

## Usage

Once installed, the script runs automatically when you visit Instagram.com.

Open the settings by clicking/tapping the **"IG Clean"** button:
- **Desktop**: bottom-left corner
- **Mobile / iOS**: bottom-right corner

The settings panel adapts to your device: a standard modal on desktop, a bottom sheet with iOS-style toggles on mobile.

**Closing the panel:**
- Tap/click the **✕** button in the top-right of the panel to close without reloading.
- Tap/click the backdrop (outside the panel) to close without reloading.
- Tap/click **Done** / **Close & Reload** to save changes and reload the page.

### Configuration Options

#### Sponsored & Suggested

- **Remove Sponsored Posts**: Removes ads from the feed at the network layer before they are rendered.
- **Blur Sponsored Posts**: Visually blurs ads that slip through the network filter (useful for the initial page load).
- **Remove Suggested Posts**: Removes "Suggested for you" and "Suggested users" cards at the network layer.
- **Blur Suggested Posts**: Visually blurs suggested content that slips through the network filter.

#### Navigation

- **Default to "Following" Feed**: Automatically redirects the home page to the Following-only feed, eliminating most algorithmic content server-side.
- **Disable Explore Page**: Redirects `/explore/` URLs to the home page and hides the Explore link in the sidebar.
- **Disable Reels Page**: Redirects `/reels/` URLs to the home page and hides the Reels link in the sidebar.
- **Hide Threads Link in Sidebar**: Removes the Threads shortcut Instagram added to the main navigation without asking.

#### Feed Content

- **Hide "New Posts" Banner**: Removes the sticky banner that snaps you back to the top of the feed mid-scroll.
- **Filter Collab / Partnership Posts**: Removes co-authored posts at the network layer. These are often cross-promoted sponsored content from two accounts posting simultaneously to both audiences.
- **Filter AI-Generated Posts**: Removes posts flagged by Instagram as AI-generated (both `AI_CREATED` and `CLASSIFIER_SCORE_HIGH` detections).
- **Filter "Add Yours" Chain Posts**: Removes viral sticker prompt posts that surface from accounts you don't follow.

#### Stories

- **Hide Stories Bar Entirely**: Hides the full horizontal stories tray to reclaim vertical space and remove the notification loop.
- **Hide Story Ring Notification Dots**: Hides the colored gradient ring around unseen stories, removing the manufactured urgency without removing stories themselves.

#### Interface

- **Hide "Download App" Banner**: Removes the persistent banner on mobile web asking you to install the app you already chose not to install.
- **Hide "Boost Post" Upsell Buttons**: Removes "Boost Post", "View Professional Dashboard", and similar monetization prompts from post cards.
- **Strip Unread Count from Tab Title**: Removes the `(3)` notification badge from the browser tab title so the tab stays quiet.
- **Hide Like & View Counts**: Hides engagement metrics via CSS. Note: Instagram's like count display varies; this is best-effort.
- **Hide Floating DM Button (Mobile)**: Removes the floating direct messages button on mobile web.

#### Privacy & Limits

- **Suppress Notification Permission Nag**: Blocks Instagram's repeated browser notification permission dialogs before they appear.
- **Suppress "Stop!" Console Warning**: Filters out Instagram's self-XSS scare message (`%cStop!` in big red text) that fires in the browser console whenever devtools is open. Harmless theatre for anyone who deliberately installed a userscript.
- **Block Error & Telemetry Reports**: Intercepts `fetch` and `XMLHttpRequest` calls to Instagram's `/error/ig_web_error_reports/` endpoint and stubs out `ReportingObserver` so JavaScript-initiated error reports are never sent. Note: the browser's native [Reporting API](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API) sends reports outside of JavaScript based on `Report-To` response headers — blocking those requires a network-level rule (uBlock Origin custom filter: `||www.instagram.com/error/ig_web_error_reports/*`).
- **Block DM Read Receipts ("Seen")**: Intercepts the `useIGDMarkThreadAsReadMutation` and `useIGDMarkThreadAsReadValidationMutation` GraphQL calls that fire when you open a DM conversation with unread messages. Blocking these prevents the sender from seeing the "Seen" timestamp. Matched via the stable `X-FB-Friendly-Name` request header rather than the `doc_id` which changes on each Instagram deploy.
- **Auto-Dismiss Cookie Consent Banner**: Automatically clicks the decline/reject button on cookie and privacy dialogs, including multilingual variants.
- **Mute Autoplay Videos**: Forces all video elements to muted, including ones dynamically injected as you scroll.
- **Hide "Active Now" Presence Indicator**: Hides the green online dot and "Active X minutes ago" text in the DM list. Note: this uses best-effort CSS selectors.
- **Session Post Limit**: Set a maximum number of posts per session (0 = unlimited). When the limit is reached, a full-screen interstitial requires a deliberate click to continue scrolling.

### Hiding the Button

Once you have configured everything, you can permanently hide the **IG Clean** button:

1. Open the settings panel.
2. Scroll to the bottom and tap **Hide This Button Forever**.

Your settings remain active — only the button is hidden. To restore it, visit this URL in your browser:

```
https://www.instagram.com/#ig-clean-show
```

The script detects the hash, restores the button, and removes the hash from the URL automatically. Reload the page and the button will reappear.

### Multilingual Support

The DOM fallback recognises sponsored and suggested labels in 17+ languages, including English, German, French, Spanish, Portuguese, Italian, Dutch, Swedish, Polish, Russian, Arabic, Japanese, Korean, Chinese (Simplified and Traditional), Indonesian, and Czech.

## Technical Details: JSON Post Filtering

This script employs a direct data-interception method to remove unwanted content at the source, rather than just hiding it visually.

### Method

The script hooks into the browser's native `JSON.parse` function and the `Response.prototype.json` method. This allows it to inspect and modify data payloads exchanged between the Instagram Single Page Application (SPA) and its backend servers.

1.  **Interception**: When Instagram requests feed data (via GraphQL API calls), the response is intercepted before it reaches the application logic.
2.  **Recursive Scanning**: The script traverses the JSON object to locate feed timelines. It looks for standard structures such as `xdt_api__v1__feed__timeline__connection` and `edges`.
3.  **Filtering**:
    - The script iterates through the `edges` (posts).
    - It inspects each item's `node` properties to identify its type.
    - **Sponsored Posts** are identified by the presence of a `node.ad` object or specific media flags (`is_sponsored`).
    - **Suggested Content** is identified by `node.suggested_users` (user cards) or `node.explore_story` (suggested posts from unconnected accounts).
4.  **Modification**: Matching items are removed from the array. The cleaned data object is then passed back to the application.
5.  **Result**: The application renders the feed using the sanitized data, unaware that ads or suggestions ever existed.

This approach prevents the "pop-in" effect often seen with CSS-only blockers and saves time/resources by not
rendering unwanted media.
A CSS blur fallback is included to handle pre-rendered content on the initial page load that
might bypass the data filter.
