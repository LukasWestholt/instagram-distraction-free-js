# Instagram Distraction Free

Instagram Distraction Free - Remove suggested and sponsored posts, reels and explore tabs.

## Installation

### Desktop (Chrome / Firefox)

1. Install the Tampermonkey browser extension:
   - [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)

2. Install the userscript:
   - Create a new script in Tampermonkey.
   - Copy the contents of `instagram_distraction_free.user.js` into the editor.
   - Save the script (Ctrl+S or File > Save).

### iOS (Safari)

Tampermonkey is available for Safari on iOS. Because Safari restricts extension capabilities, the setup requires a few extra steps.

1. **Install Tampermonkey from the App Store**
   - Search for *Tampermonkey* or install it directly from the [App Store](https://apps.apple.com/app/tampermonkey/id1482490089).

2. **Enable the extension in Safari**
   - Open **Settings** → **Apps** → **Safari** → **Extensions**.
   - Tap **Tampermonkey** and switch it on.
   - Under *Allow Extension to Read and Modify Webpages* set **instagram.com** (or *All Websites*) to **Allow**.

3. **Install the userscript**
   - Open the Tampermonkey app and tap **Create new script**.
   - Delete the placeholder content and paste the full contents of `instagram_distraction_free.user.js`.
   - Tap **Save** (the floppy disk icon, top right).

4. **Open Instagram in Safari**
   - Go to `instagram.com` in Safari — the script activates automatically.
   - A small **IG Clean** button appears in the bottom-right corner for settings.

## Usage

Once installed, the script runs automatically when you visit Instagram.com.

Open the settings by clicking/tapping the **"IG Clean"** button:
- **Desktop**: bottom-left corner
- **Mobile / iOS**: bottom-right corner (larger tap target)

The settings panel adapts to your device: a standard modal on desktop, a bottom sheet with iOS-style toggles on mobile.

**Closing the panel:**
- Tap/click the **✕** button in the top-right of the panel to close without reloading.
- Tap/click the backdrop (outside the panel) to close without reloading.
- Tap/click **Done** / **Close & Reload** to save changes and reload the page.

### Configuration Options

- **Remove Sponsored Posts**: Removes ads from the feed at the network layer before they are rendered.
- **Blur Sponsored Posts**: Visually blurs ads that slip through the network filter (useful for the initial page load).
- **Remove Suggested Posts**: Removes "Suggested for you" and "Suggested users" cards at the network layer.
- **Blur Suggested Posts**: Visually blurs suggested content that slips through the network filter.
- **Default to "Following" Feed**: Automatically redirects the home page to the Following-only feed, eliminating most algorithmic content server-side.
- **Disable Explore Page**: Redirects `/explore/` URLs to the home page and hides the Explore link in the sidebar.
- **Disable Reels Page**: Redirects `/reels/` URLs to the home page and hides the Reels link in the sidebar.

### Hiding the Button

Once you have configured everything, you can permanently hide the **IG Clean** button:

1. Open the settings panel.
2. Scroll to the bottom and tap **Hide This Button Forever**.

Your settings remain active — only the button is hidden. To restore it, open the browser console (desktop: F12 → Console; iOS: Safari Web Inspector) and run:

```js
igCleanShow()
```

Then reload the page.

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

This approach prevents the "pop-in" effect often seen with CSS-only blockers and saves time/resources by not rendering unwanted media. A CSS blur fallback is included to handle pre-rendered content on the initial page load that might bypass the data filter.
