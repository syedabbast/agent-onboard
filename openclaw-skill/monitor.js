import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { access, appendFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { homedir } from 'os';

// ─── Configuration ──────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID;
const OPENCLAW_SKILLS_DIR = resolve(
  (process.env.OPENCLAW_SKILLS_DIR || '~/.openclaw/skills').replace(/^~/, homedir())
);
const LOG_DIR = resolve(homedir(), '.openclaw', 'logs');
const LOG_FILE = resolve(LOG_DIR, 'agent-onboard.log');

const CLAW_PREFIX = '[CLAW]:';
const RESULT_PREFIX = '[RESULT]:';
const ERROR_PREFIX = '[ERROR]:';

// ─── Validation ─────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// ─── Supabase client ────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Logging ────────────────────────────────────────────────────
async function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;
  process.stdout.write(line);

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line);
  } catch {
    // Logging failure is non-fatal
  }
}

// ─── Skill validation ───────────────────────────────────────────
async function skillExists(skillName) {
  const skillPath = resolve(OPENCLAW_SKILLS_DIR, skillName);
  try {
    await access(skillPath);
    return true;
  } catch {
    return false;
  }
}

// ─── Trigger parser ─────────────────────────────────────────────
function parseTrigger(content) {
  if (!content || !content.startsWith(CLAW_PREFIX)) return null;

  const jsonStr = content.slice(CLAW_PREFIX.length).trim();
  try {
    const trigger = JSON.parse(jsonStr);
    if (!trigger.skill || !trigger.action) {
      return null;
    }
    return trigger;
  } catch (err) {
    return null;
  }
}

// ─── Execute OpenClaw skill ─────────────────────────────────────
function runOpenClaw(skill, action, params = {}) {
  return new Promise((resolve, reject) => {
    const args = ['run', skill, action];

    // Append params as --key value flags
    for (const [key, value] of Object.entries(params)) {
      args.push(`--${key}`, String(value));
    }

    log('INFO', `Executing: openclaw ${args.join(' ')}`);

    execFile('openclaw', args, { timeout: 60_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ─── Post message back to session ───────────────────────────────
async function postToSession(sessionId, content) {
  const { error } = await supabase.from('messages').insert({
    session_id: sessionId,
    agent_id: OPENCLAW_AGENT_ID,
    role: 'assistant',
    content
  });

  if (error) {
    await log('ERROR', 'Failed to post result to session', { sessionId, error: error.message });
  } else {
    await log('INFO', 'Posted result to session', { sessionId });
  }
}

// ─── Handle incoming trigger ────────────────────────────────────
async function handleTrigger(message) {
  const trigger = parseTrigger(message.content);
  if (!trigger) return;

  const sessionId = message.session_id;
  const { skill, action, params } = trigger;

  await log('INFO', 'Received trigger', { sessionId, skill, action });

  // Validate skill exists
  const exists = await skillExists(skill);
  if (!exists) {
    const errorMsg = `${ERROR_PREFIX} ${JSON.stringify({
      source: 'openclaw',
      skill,
      action,
      error: `Skill "${skill}" not found in ${OPENCLAW_SKILLS_DIR}`
    })}`;
    await postToSession(sessionId, errorMsg);
    await log('WARN', `Skill not found: ${skill}`);
    return;
  }

  // Execute the skill
  try {
    const output = await runOpenClaw(skill, action, params || {});
    const resultMsg = `${RESULT_PREFIX} ${JSON.stringify({
      source: 'openclaw',
      skill,
      action,
      output
    })}`;
    await postToSession(sessionId, resultMsg);
    await log('INFO', 'Skill executed successfully', { skill, action });
  } catch (err) {
    const errorMsg = `${ERROR_PREFIX} ${JSON.stringify({
      source: 'openclaw',
      skill,
      action,
      error: err.message
    })}`;
    await postToSession(sessionId, errorMsg);
    await log('ERROR', 'Skill execution failed', { skill, action, error: err.message });
  }
}

// ─── Realtime subscription ──────────────────────────────────────
async function startMonitor() {
  await log('INFO', 'Starting OpenClaw monitor...');
  await log('INFO', `Skills directory: ${OPENCLAW_SKILLS_DIR}`);
  await log('INFO', `Log file: ${LOG_FILE}`);

  const channel = supabase
    .channel('openclaw-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      },
      (payload) => {
        const message = payload.new;
        if (message.content && message.content.startsWith(CLAW_PREFIX)) {
          handleTrigger(message).catch((err) => {
            log('ERROR', 'Unhandled error in trigger handler', { error: err.message });
          });
        }
      }
    )
    .subscribe((status) => {
      log('INFO', `Realtime subscription status: ${status}`);
    });

  // Graceful shutdown
  const shutdown = async () => {
    await log('INFO', 'Shutting down monitor...');
    await supabase.removeChannel(channel);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Agent OnBoard — OpenClaw Monitor       ║
  ║   Watching for [CLAW]: triggers          ║
  ║   Skills: ${OPENCLAW_SKILLS_DIR.slice(0, 31).padEnd(31)}║
  ╚══════════════════════════════════════════╝
  `);
}

startMonitor();
