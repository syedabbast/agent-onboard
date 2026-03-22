# Agent OnBoard — Chrome Extension

Browser bridge that connects Agent OnBoard sessions to Chrome for automation tasks like navigation, form filling, and page scraping.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory

## Configuration

1. Click the Agent OnBoard extension icon in the toolbar
2. Enter your Supabase URL and Anon Key
3. Enter your Agent ID
4. Click **Save Settings**

## Usage

1. Click **Start Monitoring** in the extension popup
2. The extension watches for `[CHROME]:` trigger messages in your Supabase sessions
3. When a trigger arrives, you will see an approval popup
4. Approve or deny the action
5. Results are posted back to the session as `[RESULT]:` messages

## Supported Actions

| Action | Description | Params |
|---|---|---|
| `navigate` | Open a URL in a new tab | `{ url }` |
| `new_tab` | Open a new tab | `{ url? }` |
| `fill_form` | Set a form field value | `{ selector, value }` |
| `click_element` | Click an element | `{ selector }` |
| `scrape_page` | Extract page content | `{ selector? }` |
| `get_page_text` | Get full page text | none |

## Trigger Format

```
[CHROME]: {"action": "navigate", "params": {"url": "https://example.com"}}
```

## Security

- All actions require explicit user approval via the popup
- The extension only runs content scripts on auwiretech.com and localhost
- Supabase credentials are stored in chrome.storage.local
