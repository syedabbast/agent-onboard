/* ─────────────────────────────────────────────────────────────
   Agent OnBoard — Chrome Extension Background Service Worker
   Monitors Supabase for [CHROME]: triggers and dispatches
   browser automation actions.
   ───────────────────────────────────────────────────────────── */

const CHROME_PREFIX = '[CHROME]:';
const RESULT_PREFIX = '[RESULT]:';
const ERROR_PREFIX = '[ERROR]:';

let supabaseUrl = '';
let supabaseKey = '';
let agentId = '';
let monitoring = false;
let pollInterval = null;
let lastChecked = new Date().toISOString();
let pendingApproval = null;

// ─── Config ─────────────────────────────────────────────────────

async function loadConfig() {
  const config = await chrome.storage.local.get([
    'supabaseUrl', 'supabaseKey', 'agentId', 'monitoring'
  ]);
  supabaseUrl = config.supabaseUrl || '';
  supabaseKey = config.supabaseKey || '';
  agentId = config.agentId || '';
  monitoring = config.monitoring || false;
  return { supabaseUrl, supabaseKey, agentId, monitoring };
}

// ─── Supabase REST helpers ──────────────────────────────────────

async function supabaseFetch(path, options = {}) {
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');

  const url = `${supabaseUrl}/rest/v1${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function postToSession(sessionId, content) {
  return supabaseFetch('/messages', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      agent_id: agentId,
      role: 'assistant',
      content
    })
  });
}

// ─── Trigger parser ─────────────────────────────────────────────

function parseTrigger(content) {
  if (!content || !content.startsWith(CHROME_PREFIX)) return null;
  try {
    return JSON.parse(content.slice(CHROME_PREFIX.length).trim());
  } catch {
    return null;
  }
}

// ─── Action handlers ────────────────────────────────────────────

async function handleNavigate(params) {
  const { url } = params;
  if (!url) throw new Error('Missing url parameter');
  const tab = await chrome.tabs.create({ url, active: true });
  return { action: 'navigate', tabId: tab.id, url };
}

async function handleNewTab(params) {
  const { url } = params;
  const tab = await chrome.tabs.create({ url: url || 'about:blank', active: true });
  return { action: 'new_tab', tabId: tab.id, url: tab.pendingUrl || url };
}

async function handleFillForm(params) {
  const { selector, value } = params;
  if (!selector || value === undefined) throw new Error('Missing selector or value');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: `Element not found: ${sel}` };
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, selector: sel };
    },
    args: [selector, value]
  });

  return results[0]?.result || { success: false, error: 'Script execution failed' };
}

async function handleClickElement(params) {
  const { selector } = params;
  if (!selector) throw new Error('Missing selector');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: `Element not found: ${sel}` };
      el.click();
      return { success: true, selector: sel };
    },
    args: [selector]
  });

  return results[0]?.result || { success: false, error: 'Script execution failed' };
}

async function handleScrapePage(params) {
  const { selector } = params;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => {
      if (sel) {
        const els = document.querySelectorAll(sel);
        return {
          success: true,
          count: els.length,
          data: Array.from(els).map((el) => ({
            text: el.textContent?.trim().slice(0, 500),
            html: el.outerHTML?.slice(0, 1000),
            tag: el.tagName
          }))
        };
      }
      return {
        success: true,
        title: document.title,
        url: location.href,
        text: document.body?.innerText?.slice(0, 5000) || ''
      };
    },
    args: [selector || null]
  });

  return results[0]?.result || { success: false, error: 'Script execution failed' };
}

async function handleGetPageText(_params) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      success: true,
      title: document.title,
      url: location.href,
      text: document.body?.innerText?.slice(0, 10000) || ''
    })
  });

  return results[0]?.result || { success: false, error: 'Script execution failed' };
}

const ACTION_HANDLERS = {
  navigate: handleNavigate,
  new_tab: handleNewTab,
  fill_form: handleFillForm,
  click_element: handleClickElement,
  scrape_page: handleScrapePage,
  get_page_text: handleGetPageText
};

// ─── Approval flow ──────────────────────────────────────────────

function requestApproval(trigger, sessionId) {
  return new Promise((resolve) => {
    pendingApproval = { trigger, sessionId, resolve };

    // Show notification
    chrome.notifications.create('agent-onboard-approval', {
      type: 'basic',
      title: 'Agent OnBoard — Action Requested',
      message: `Action: ${trigger.action}\nSession: ${sessionId?.slice(0, 8)}...`,
      requireInteraction: true
    });

    // Notify popup if open
    chrome.runtime.sendMessage({
      type: 'approval_request',
      trigger,
      sessionId
    }).catch(() => {});
  });
}

// ─── Process trigger ────────────────────────────────────────────

async function processTrigger(message) {
  const trigger = parseTrigger(message.content);
  if (!trigger) return;

  const sessionId = message.session_id;
  const { action, params } = trigger;

  console.log(`[AgentOnBoard] Trigger received: ${action}`, trigger);

  const handler = ACTION_HANDLERS[action];
  if (!handler) {
    const errorContent = `${ERROR_PREFIX} ${JSON.stringify({
      source: 'chrome',
      action,
      error: `Unknown action: ${action}. Available: ${Object.keys(ACTION_HANDLERS).join(', ')}`
    })}`;
    await postToSession(sessionId, errorContent);
    return;
  }

  // Request approval before executing
  const approved = await requestApproval(trigger, sessionId);
  if (!approved) {
    const errorContent = `${ERROR_PREFIX} ${JSON.stringify({
      source: 'chrome',
      action,
      error: 'Action denied by user'
    })}`;
    await postToSession(sessionId, errorContent);
    return;
  }

  try {
    const result = await handler(params || {});
    const resultContent = `${RESULT_PREFIX} ${JSON.stringify({
      source: 'chrome',
      action,
      result
    })}`;
    await postToSession(sessionId, resultContent);
    console.log(`[AgentOnBoard] Action completed: ${action}`);
  } catch (err) {
    const errorContent = `${ERROR_PREFIX} ${JSON.stringify({
      source: 'chrome',
      action,
      error: err.message
    })}`;
    await postToSession(sessionId, errorContent);
    console.error(`[AgentOnBoard] Action failed: ${action}`, err);
  }
}

// ─── Polling monitor ────────────────────────────────────────────

async function pollMessages() {
  if (!monitoring || !supabaseUrl || !supabaseKey) return;

  try {
    const encoded = encodeURIComponent(lastChecked);
    const messages = await supabaseFetch(
      `/messages?content=like.[CHROME]:*&created_at=gt.${encoded}&order=created_at.asc&limit=10`
    );

    for (const msg of messages) {
      await processTrigger(msg);
      lastChecked = msg.created_at;
    }
  } catch (err) {
    console.error('[AgentOnBoard] Poll error:', err.message);
  }
}

function startMonitoring() {
  if (pollInterval) clearInterval(pollInterval);
  monitoring = true;
  lastChecked = new Date().toISOString();
  pollInterval = setInterval(pollMessages, 3000);
  chrome.storage.local.set({ monitoring: true });
  console.log('[AgentOnBoard] Monitoring started');
}

function stopMonitoring() {
  monitoring = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  chrome.storage.local.set({ monitoring: false });
  console.log('[AgentOnBoard] Monitoring stopped');
}

// ─── Message handler from popup / content scripts ───────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get_status') {
    sendResponse({
      monitoring,
      configured: !!(supabaseUrl && supabaseKey && agentId),
      pending: pendingApproval ? {
        action: pendingApproval.trigger.action,
        sessionId: pendingApproval.sessionId
      } : null
    });
    return true;
  }

  if (message.type === 'start_monitoring') {
    loadConfig().then(() => {
      startMonitoring();
      sendResponse({ monitoring: true });
    });
    return true;
  }

  if (message.type === 'stop_monitoring') {
    stopMonitoring();
    sendResponse({ monitoring: false });
    return true;
  }

  if (message.type === 'approval_response') {
    if (pendingApproval) {
      pendingApproval.resolve(message.approved);
      pendingApproval = null;
      chrome.notifications.clear('agent-onboard-approval');
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'save_config') {
    chrome.storage.local.set({
      supabaseUrl: message.supabaseUrl,
      supabaseKey: message.supabaseKey,
      agentId: message.agentId
    }, () => {
      loadConfig().then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  return false;
});

// ─── Initialize ─────────────────────────────────────────────────

loadConfig().then(() => {
  if (monitoring && supabaseUrl && supabaseKey) {
    startMonitoring();
  }
  console.log('[AgentOnBoard] Background worker initialized');
});
