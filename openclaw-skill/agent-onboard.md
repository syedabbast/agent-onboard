# Agent OnBoard — OpenClaw Skill

## Overview

This skill connects Agent OnBoard sessions to locally installed OpenClaw skills. When an Agent OnBoard session emits a `[CLAW]:` trigger message, the monitor picks it up, validates the requested skill, and runs it via the `openclaw` CLI.

## Trigger Format

Messages with the `[CLAW]:` prefix are parsed as JSON triggers:

```
[CLAW]: {"skill": "research", "action": "search", "params": {"query": "OSHA requirements"}}
```

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `skill` | string | yes | Name of the OpenClaw skill to invoke |
| `action` | string | yes | Action within that skill |
| `params` | object | no | Key-value parameters passed to the skill |
| `sessionId` | string | auto | Injected by the monitor from the message context |

## Response Format

On success:
```
[RESULT]: {"source": "openclaw", "skill": "research", "action": "search", "output": "..."}
```

On failure:
```
[ERROR]: {"source": "openclaw", "skill": "research", "action": "search", "error": "Skill not found"}
```

## Installation

1. Ensure OpenClaw CLI is installed and skills are in `~/.openclaw/skills/`
2. Copy `.env.example` to `.env` and fill in Supabase credentials
3. Run `npm install`
4. Run `npm start`

## Logs

All activity is logged to `~/.openclaw/logs/agent-onboard.log`.
