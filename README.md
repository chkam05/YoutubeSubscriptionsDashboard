# Youtube Substriptions Dashboard

[English](README.md) | [Polski](README-pl_PL.md)

A Manifest V3 extension for Google Chrome and Microsoft Edge. It provides a clean, locally stored dashboard of recent videos from selected YouTube channels without requiring a YouTube API key or a Google account.

## Features

- Add channels using a full YouTube URL, an `@handle`, or a channel ID beginning with `UC`.
- Fetch recent publications from public YouTube RSS feeds.
- Configure a history window from 1 to 365 days.
- Organize channels in nested categories and group the dashboard by category.
- Filter by a category together with all its subcategories.
- Search by channel or video title.
- Highlight videos published today and hide individual videos.
- Optionally hide channels with no visible videos.
- Choose between light and dark themes.
- Refresh channels manually or automatically and view update progress.
- Import and export settings and locally cached data as JSON.
- Store all application data locally in `chrome.storage.local`.

## Installation in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `YoutubeSubscriptionsDashboard` directory.
5. Select the extension icon to open the dashboard.

## Installation in Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `YoutubeSubscriptionsDashboard` directory.
5. Select the extension icon to open the dashboard.

## Usage

Open the extension settings to add categories and channels. A channel can be entered as, for example:

```text
https://www.youtube.com/@channel/videos
@channel
UCxxxxxxxxxxxxxxxxxxxxxx
```

Use the dashboard to browse videos, filter categories, search, hide individual entries, and refresh channel data. Settings also provide JSON backup and restore controls. Import replaces the current data after confirmation and validates the selected file before saving it.

## RSS limitation

A YouTube RSS feed contains only a limited number of the channel's latest publications. The extension retains previously fetched videos in its local cache until they fall outside the configured history window. When a channel is added for the first time, the extension cannot reconstruct older publications that are no longer present in the current RSS feed.

## Data and privacy

The extension does not sign in to Google, read browser or YouTube viewing history, or send data to a custom server. It connects to YouTube to resolve channels and retrieve public RSS feeds. Settings, categories, channels, cached videos, and hidden-video information remain in the browser profile unless explicitly exported to a JSON file.

## Project information

- Version: `1.0.0.0`
- Author: Kamil Karpiński
- License: [GNU General Public License v3.0](LICENSE)
