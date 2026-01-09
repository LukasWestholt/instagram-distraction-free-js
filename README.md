# Instagram Distraction Free

Instagram Distraction Free - Remove suggested and sponsored posts, reels and explore tabs.

## Installation

1. Install the Tampermonkey browser extension:
   - [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)

2. Install the userscript:
   - Create a new script in Tampermonkey.
   - Copy the contents of `instagram_distraction_free.user.js` into the editor.
   - Save the script (Ctrl+S or File > Save).

## Usage

Once installed, the script runs automatically when you visit Instagram.com.

You can configure the behavior by clicking the **"IG Clean"** button located in the bottom-right corner of the screen.

### Configuration Options

- **Remove Sponsored Posts**: Prevents ads from loading in your feed.
- **Blur Sponsored Posts**: visually blurs ads if they slip through the data filter (useful for initial page loads).
- **Remove Suggested Posts**: Prevents "Suggested for you" and "Suggested users" cards from loading.
- **Blur Suggested Posts**: Visually blurs suggested content if it slips through.
- **Default to "Following" Feed**: Automatically redirects you to the "Following" feed when you visit the home page, ensuring you only see posts from people you follow.
- **Disable Explore Page**: Redirects `/explore/` URLs to the home page and hides the Explore link in the sidebar.
- **Disable Reels Page**: Redirects `/reels/` URLs to the home page and hides the Reels link in the sidebar.

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
