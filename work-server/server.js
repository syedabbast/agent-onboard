import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { resolve, join, normalize } from 'path';
import { homedir } from 'os';

// ─── Configuration ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3002;
const WORK_SERVER_TOKEN = process.env.WORK_SERVER_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SCRIPTS_DIR = resolve(
  (process.env.SCRIPTS_DIR || '~/agent-onboard-scripts').replace(/^~/, homedir())
);
const COMMAND_TIMEOUT_MS = 30_000;

// ─── Whitelists ─────────────────────────────────────────────────
const COMMAND_WHITELIST = [
  'python', 'python3', 'node', 'npm', 'npx',
  'echo', 'ls', 'pwd', 'cat', 'grep', 'curl',
  'openclaw'
];

// ─── Security helpers ───────────────────────────────────────────

/**
 * Returns true if the base command is in the whitelist.
 */
function isCommandAllowed(command) {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();
  if (trimmed.length === 0) return false;

  // Extract the base binary (first token, ignore env-var prefixes like KEY=val)
  const tokens = trimmed.split(/\s+/);
  let base = null;
  for (const t of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue; // skip env assignments
    base = t;
    break;
  }
  if (!base) return false;

  // Reject shell operators
  if (/[;&|`$(){}]/.test(trimmed)) return false;

  // Allow only whitelisted commands
  const baseName = base.split('/').pop();
  return COMMAND_WHITELIST.includes(baseName);
}

/**
 * Returns true if the script path lives inside SCRIPTS_DIR.
 */
function isScriptAllowed(scriptPath) {
  if (!scriptPath || typeof scriptPath !== 'string') return false;
  const resolved = resolve(scriptPath.replace(/^~/, homedir()));
  const normalizedScripts = normalize(SCRIPTS_DIR);
  return resolved.startsWith(normalizedScripts + '/') || resolved === normalizedScripts;
}

/**
 * Returns true if filePath lives inside SCRIPTS_DIR (for read/write/list).
 */
function isPathAllowed(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const resolved = resolve(filePath.replace(/^~/, homedir()));
  const normalizedScripts = normalize(SCRIPTS_DIR);
  return resolved.startsWith(normalizedScripts + '/') || resolved === normalizedScripts;
}

// ─── Supabase result poster ─────────────────────────────────────

/**
 * Posts a result message back to the Supabase messages table
 * so the session chat can display it.
 */
async function postResultToSession({ sessionId, agentId, content, role = 'assistant' }) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[postResult] Supabase not configured — skipping post.');
    return null;
  }

  const url = `${SUPABASE_URL}/rest/v1/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        session_id: sessionId,
        agent_id: agentId,
        role,
        content
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[postResult] Supabase error:', response.status, text);
      return null;
    }

    const data = await response.json();
    console.log('[postResult] Posted result to session', sessionId);
    return data;
  } catch (err) {
    console.error('[postResult] Network error:', err.message);
    return null;
  }
}

// ─── Express app ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ─── Auth middleware ────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['x-work-token'];
  if (!WORK_SERVER_TOKEN) {
    return res.status(500).json({ error: 'Server token not configured' });
  }
  if (!token || token !== WORK_SERVER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing x-work-token' });
  }
  next();
}

// Apply auth to all routes except /health
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  authMiddleware(req, res, next);
});

// ─── GET /health ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    machine: process.platform,
    uptime: process.uptime(),
    scriptsDir: SCRIPTS_DIR,
    whitelist: COMMAND_WHITELIST,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ─── POST /execute ──────────────────────────────────────────────
app.post('/execute', (req, res) => {
  const { command, sessionId, agentId, timeout } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Missing "command" in request body' });
  }

  if (!isCommandAllowed(command)) {
    return res.status(403).json({
      error: 'Command not allowed',
      hint: `Allowed commands: ${COMMAND_WHITELIST.join(', ')}`,
      received: command.split(/\s+/)[0]
    });
  }

  const execTimeout = Math.min(timeout || COMMAND_TIMEOUT_MS, 60_000);

  exec(command, { timeout: execTimeout, cwd: SCRIPTS_DIR, maxBuffer: 1024 * 1024 }, async (err, stdout, stderr) => {
    const result = {
      success: !err,
      command,
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: err ? err.code || 1 : 0,
      killed: err ? !!err.killed : false,
      timestamp: new Date().toISOString()
    };

    // Post result back to Supabase session if IDs provided
    if (sessionId) {
      const content = `[RESULT]: ${JSON.stringify(result)}`;
      await postResultToSession({ sessionId, agentId, content });
    }

    res.json(result);
  });
});

// ─── POST /read-file ────────────────────────────────────────────
app.post('/read-file', async (req, res) => {
  const { path: filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'Missing "path" in request body' });
  }

  const resolved = resolve(filePath.replace(/^~/, homedir()));

  if (!isPathAllowed(resolved)) {
    return res.status(403).json({
      error: 'Path not allowed',
      hint: `Files must be inside ${SCRIPTS_DIR}`
    });
  }

  try {
    const content = await readFile(resolved, 'utf-8');
    res.json({ success: true, path: resolved, content, size: content.length });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// ─── POST /write-file ───────────────────────────────────────────
app.post('/write-file', async (req, res) => {
  const { path: filePath, content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Missing "path" or "content" in request body' });
  }

  const resolved = resolve(filePath.replace(/^~/, homedir()));

  if (!isPathAllowed(resolved)) {
    return res.status(403).json({
      error: 'Path not allowed',
      hint: `Files must be inside ${SCRIPTS_DIR}`
    });
  }

  try {
    // Ensure parent directory exists
    const parentDir = resolve(resolved, '..');
    await mkdir(parentDir, { recursive: true });
    await writeFile(resolved, content, 'utf-8');
    res.json({ success: true, path: resolved, size: content.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /list-files ───────────────────────────────────────────
app.post('/list-files', async (req, res) => {
  const { path: dirPath } = req.body;

  const target = dirPath
    ? resolve(dirPath.replace(/^~/, homedir()))
    : SCRIPTS_DIR;

  if (!isPathAllowed(target)) {
    return res.status(403).json({
      error: 'Path not allowed',
      hint: `Must be inside ${SCRIPTS_DIR}`
    });
  }

  try {
    const entries = await readdir(target);
    const files = [];

    for (const entry of entries) {
      const fullPath = join(target, entry);
      try {
        const info = await stat(fullPath);
        files.push({
          name: entry,
          path: fullPath,
          isDirectory: info.isDirectory(),
          size: info.size,
          modified: info.mtime.toISOString()
        });
      } catch {
        files.push({ name: entry, path: fullPath, error: 'stat failed' });
      }
    }

    res.json({ success: true, directory: target, files });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// ─── Start server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Agent OnBoard — Work Server            ║
  ║   Port:    ${String(PORT).padEnd(29)}║
  ║   Scripts: ${SCRIPTS_DIR.slice(0, 29).padEnd(29)}║
  ║   Auth:    ${WORK_SERVER_TOKEN ? 'Configured' : 'NOT SET — requests will fail!'.padEnd(29)}║
  ╚══════════════════════════════════════════╝
  `);
});
