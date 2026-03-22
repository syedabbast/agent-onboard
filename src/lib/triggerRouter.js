/**
 * triggerRouter.js — Detects, parses, and routes trigger messages
 * in Agent OnBoard sessions.
 *
 * Trigger prefixes:
 *   [WORK]:    → local work server execution
 *   [CLAW]:    → OpenClaw skill invocation
 *   [CHROME]:  → Chrome extension action
 *   [RESULT]:  → result from any trigger
 *   [ERROR]:   → error from any trigger
 */

const PREFIXES = {
  work:    '[WORK]:',
  openclaw:'[CLAW]:',
  chrome:  '[CHROME]:',
  result:  '[RESULT]:',
  error:   '[ERROR]:'
};

const WORK_SERVER_URL = import.meta.env.VITE_WORK_SERVER_URL || 'http://localhost:3002';
const WORK_SERVER_TOKEN = import.meta.env.VITE_WORK_SERVER_TOKEN || '';

// ─── Detection ──────────────────────────────────────────────────

/**
 * Detect the trigger type from message content.
 * @param {string} content - Raw message content
 * @returns {'work'|'openclaw'|'chrome'|'result'|'error'|null}
 */
export function detectTrigger(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  if (trimmed.startsWith(PREFIXES.work))     return 'work';
  if (trimmed.startsWith(PREFIXES.openclaw)) return 'openclaw';
  if (trimmed.startsWith(PREFIXES.chrome))   return 'chrome';
  if (trimmed.startsWith(PREFIXES.result))   return 'result';
  if (trimmed.startsWith(PREFIXES.error))    return 'error';

  return null;
}

// ─── Parsing ────────────────────────────────────────────────────

/**
 * Parse the JSON payload from a trigger message.
 * @param {string} content - Raw message content
 * @param {string} type - Trigger type from detectTrigger()
 * @returns {object|null} Parsed trigger data, or null on parse failure
 */
export function parseTrigger(content, type) {
  if (!content || !type) return null;

  const prefix = PREFIXES[type];
  if (!prefix) return null;

  const jsonStr = content.slice(prefix.length).trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    // If not valid JSON, return the raw text wrapped
    return { raw: jsonStr };
  }
}

// ─── Work Server Routing ────────────────────────────────────────

/**
 * Route a work trigger to the local work server.
 * @param {object} trigger - Parsed trigger data (must include command)
 * @param {string} sessionId - Current session UUID
 * @param {string} agentId - Current agent UUID
 * @returns {Promise<object>} Work server response
 */
export async function routeWorkTrigger(trigger, sessionId, agentId) {
  const { command, endpoint, path, content: fileContent } = trigger;

  // Determine which endpoint to call
  let url = `${WORK_SERVER_URL}/execute`;
  let body = { command, sessionId, agentId };

  if (endpoint === 'read-file') {
    url = `${WORK_SERVER_URL}/read-file`;
    body = { path };
  } else if (endpoint === 'write-file') {
    url = `${WORK_SERVER_URL}/write-file`;
    body = { path, content: fileContent };
  } else if (endpoint === 'list-files') {
    url = `${WORK_SERVER_URL}/list-files`;
    body = { path };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-work-token': WORK_SERVER_TOKEN
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Work server returned ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Work server request timed out (30s)');
    }
    throw err;
  }
}

// ─── Health Check ───────────────────────────────────────────────

/**
 * Check if the local work server is running.
 * @returns {Promise<object|null>} Health data or null if unreachable
 */
export async function checkWorkServer() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${WORK_SERVER_URL}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.json();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─── Display Formatting ─────────────────────────────────────────

const TRIGGER_STYLES = {
  work: {
    icon: '\u2699\ufe0f',
    label: 'Work Server',
    borderColor: '#d69e2e',  // amber
    bgColor: 'rgba(214, 158, 46, 0.08)'
  },
  openclaw: {
    icon: '\ud83e\udea4',
    label: 'OpenClaw',
    borderColor: '#48bb78',  // green
    bgColor: 'rgba(72, 187, 120, 0.08)'
  },
  chrome: {
    icon: '\ud83c\udf10',
    label: 'Chrome',
    borderColor: '#4299e1',  // blue
    bgColor: 'rgba(66, 153, 225, 0.08)'
  },
  result: {
    icon: '\u2705',
    label: 'Result',
    borderColor: '#48bb78',  // green
    bgColor: 'rgba(72, 187, 120, 0.08)'
  },
  error: {
    icon: '\u274c',
    label: 'Error',
    borderColor: '#e53e3e',  // red
    bgColor: 'rgba(229, 62, 62, 0.08)'
  }
};

/**
 * Get formatting info for a trigger message.
 * @param {string} content - Raw message content
 * @param {string} type - Trigger type
 * @returns {object} { icon, label, borderColor, bgColor, data }
 */
export function formatTriggerMessage(content, type) {
  const style = TRIGGER_STYLES[type] || {
    icon: '\ud83d\udce8',
    label: 'Unknown',
    borderColor: '#718096',
    bgColor: 'rgba(113, 128, 150, 0.08)'
  };

  const data = parseTrigger(content, type);

  return {
    ...style,
    data,
    type,
    raw: content
  };
}
