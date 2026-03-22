/* ─────────────────────────────────────────────────────────────
   Agent OnBoard — Chrome Extension Content Script
   Runs on auwiretech.com and localhost pages.
   Listens for messages from the background service worker
   and interacts with the page DOM.
   ───────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  // ─── Message listener from background ───────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === 'ping') {
      sendResponse({ alive: true, url: location.href });
      return true;
    }

    if (message.type === 'get_page_info') {
      sendResponse({
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        forms: document.forms.length,
        links: document.links.length
      });
      return true;
    }

    if (message.type === 'query_selector') {
      const { selector } = message;
      try {
        const el = document.querySelector(selector);
        if (!el) {
          sendResponse({ found: false });
        } else {
          sendResponse({
            found: true,
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 200),
            value: el.value || null,
            visible: el.offsetParent !== null
          });
        }
      } catch (err) {
        sendResponse({ found: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'query_selector_all') {
      const { selector } = message;
      try {
        const els = document.querySelectorAll(selector);
        const results = Array.from(els).slice(0, 50).map((el) => ({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 200),
          id: el.id || null,
          className: el.className || null
        }));
        sendResponse({ count: els.length, results });
      } catch (err) {
        sendResponse({ count: 0, results: [], error: err.message });
      }
      return true;
    }

    if (message.type === 'fill_input') {
      const { selector, value } = message;
      try {
        const el = document.querySelector(selector);
        if (!el) {
          sendResponse({ success: false, error: 'Element not found' });
        } else {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          sendResponse({ success: true });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'click_element') {
      const { selector } = message;
      try {
        const el = document.querySelector(selector);
        if (!el) {
          sendResponse({ success: false, error: 'Element not found' });
        } else {
          el.click();
          sendResponse({ success: true });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'get_text') {
      sendResponse({
        title: document.title,
        text: document.body?.innerText?.slice(0, 10000) || ''
      });
      return true;
    }

    return false;
  });

  console.log('[AgentOnBoard] Content script loaded on', location.href);
})();
