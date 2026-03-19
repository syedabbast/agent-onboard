import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// ─── SECURITY: Rate limiting per API key ──────────────
const rateLimits = new Map()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX = 20       // 20 requests per minute per key

function checkRateLimit(apiKey) {
  const keyHash = apiKey.slice(0, 8) + apiKey.slice(-4)
  const now = Date.now()
  const record = rateLimits.get(keyHash) || { count: 0, reset: now + RATE_LIMIT_WINDOW }
  if (now > record.reset) {
    record.count = 0
    record.reset = now + RATE_LIMIT_WINDOW
  }
  record.count++
  rateLimits.set(keyHash, record)
  return record.count <= RATE_LIMIT_MAX
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimits.entries()) {
    if (now > record.reset + RATE_LIMIT_WINDOW) rateLimits.delete(key)
  }
}, 300000)

// ─── SECURITY: Input sanitization ─────────────────────
function sanitizeInput(str) {
  if (typeof str !== 'string') return ''
  return str.slice(0, 50000) // Max 50k chars for prompts
}

// ═══════════════════════════════════════════════════════
// LLM HANDLERS — Every Major Platform
// ═══════════════════════════════════════════════════════

// ─── Claude (Anthropic) ───────────────────────────────
async function callClaude(apiKey, systemPrompt, messages, model) {
  const anthropic = new Anthropic({ apiKey })
  const result = await anthropic.messages.create({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: messages.slice(-10)
  })
  return result.content[0].text
}

// ─── OpenAI (GPT) ────────────────────────────────────
async function callOpenAI(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey })
  const result = await openai.chat.completions.create({
    model: model || 'gpt-4o',
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10)
    ]
  })
  return result.choices[0].message.content
}

// ─── Google Gemini ────────────────────────────────────
async function callGemini(apiKey, systemPrompt, messages, model) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model: model || 'gemini-2.0-flash',
    systemInstruction: systemPrompt
  })
  const history = messages.slice(-10).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const lastMsg = history.pop()
  const chat = geminiModel.startChat({ history })
  const result = await chat.sendMessage(lastMsg.parts[0].text)
  return result.response.text()
}

// ─── Mistral AI ───────────────────────────────────────
async function callMistral(apiKey, systemPrompt, messages, model) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'mistral-medium-latest',
      max_tokens: 500,
      messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
    })
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.choices[0].message.content
}

// ─── Cohere ───────────────────────────────────────────
async function callCohere(apiKey, systemPrompt, messages, model) {
  const response = await fetch('https://api.cohere.ai/v2/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'command-r',
      system: systemPrompt,
      messages: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      max_tokens: 500
    })
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error || data.message)
  return data.message?.content?.[0]?.text || data.text
}

// ─── Perplexity AI ────────────────────────────────────
async function callPerplexity(apiKey, systemPrompt, messages, model) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'sonar',
      max_tokens: 500,
      messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
    })
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.choices[0].message.content
}

// ─── Together AI ──────────────────────────────────────
async function callTogether(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.together.xyz/v1' })
  const result = await openai.chat.completions.create({
    model: model || 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── Groq ─────────────────────────────────────────────
async function callGroq(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })
  const result = await openai.chat.completions.create({
    model: model || 'llama-3.3-70b-versatile',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── Fireworks AI ─────────────────────────────────────
async function callFireworks(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.fireworks.ai/inference/v1' })
  const result = await openai.chat.completions.create({
    model: model || 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── DeepSeek ─────────────────────────────────────────
async function callDeepSeek(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' })
  const result = await openai.chat.completions.create({
    model: model || 'deepseek-chat',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── xAI (Grok) ──────────────────────────────────────
async function callXAI(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' })
  const result = await openai.chat.completions.create({
    model: model || 'grok-3-mini',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── Azure OpenAI ─────────────────────────────────────
async function callAzure(apiKey, systemPrompt, messages, model) {
  // Azure uses OpenAI-compatible API with different base URL
  const openai = new OpenAI({ apiKey })
  const result = await openai.chat.completions.create({
    model: model || 'gpt-4o',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── Replicate ────────────────────────────────────────
async function callReplicate(apiKey, systemPrompt, messages, model) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'meta/meta-llama-3.1-70b-instruct',
      input: {
        system_prompt: systemPrompt,
        prompt: messages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n'),
        max_tokens: 500
      }
    })
  })
  const data = await response.json()
  if (data.error) throw new Error(JSON.stringify(data.error))
  // Replicate is async — poll for result
  let prediction = data
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise(r => setTimeout(r, 1000))
    const poll = await fetch(prediction.urls.get, { headers: { 'Authorization': `Bearer ${apiKey}` } })
    prediction = await poll.json()
  }
  if (prediction.status === 'failed') throw new Error('Replicate prediction failed')
  return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output
}

// ─── Hugging Face Inference ───────────────────────────
async function callHuggingFace(apiKey, systemPrompt, messages, model) {
  const response = await fetch(`https://api-inference.huggingface.co/models/${model || 'meta-llama/Llama-3.1-70B-Instruct'}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'meta-llama/Llama-3.1-70B-Instruct',
      max_tokens: 500,
      messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
    })
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error)
  return data.choices[0].message.content
}

// ─── OpenRouter ───────────────────────────────────────
async function callOpenRouter(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })
  const result = await openai.chat.completions.create({
    model: model || 'anthropic/claude-sonnet-4',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ─── Generic OpenAI-compatible ────────────────────────
async function callGeneric(apiKey, systemPrompt, messages, model) {
  const openai = new OpenAI({ apiKey })
  const result = await openai.chat.completions.create({
    model: model || 'gpt-4o',
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)]
  })
  return result.choices[0].message.content
}

// ═══════════════════════════════════════════════════════
// PLATFORM ROUTER
// ═══════════════════════════════════════════════════════

const platformHandlers = {
  'Claude (Anthropic)':  callClaude,
  'OpenAI (GPT)':        callOpenAI,
  'Microsoft Copilot':   callOpenAI,
  'Google Gemini':       callGemini,
  'Mistral AI':          callMistral,
  'Cohere':              callCohere,
  'Perplexity AI':       callPerplexity,
  'Together AI':         callTogether,
  'Groq':                callGroq,
  'Fireworks AI':        callFireworks,
  'DeepSeek':            callDeepSeek,
  'xAI (Grok)':          callXAI,
  'AWS Bedrock':         callClaude, // Bedrock uses Anthropic SDK
  'Azure OpenAI':        callAzure,
  'Replicate':           callReplicate,
  'Hugging Face':        callHuggingFace,
  'OpenRouter':          callOpenRouter,
  'OpenClaw':            callGeneric,
  'LangChain':           callGeneric,
  'Other':               callGeneric,
}

// ═══════════════════════════════════════════════════════
// API ENDPOINT
// ═══════════════════════════════════════════════════════

app.post('/api/agent-respond', async (req, res) => {
  const { api_key, platform, system_prompt, messages, model } = req.body

  // --- Security checks ---
  if (!api_key || !messages) {
    return res.status(400).json({ error: 'Missing api_key or messages' })
  }
  if (typeof api_key !== 'string' || api_key.length < 10) {
    return res.status(400).json({ error: 'Invalid API key' })
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages must be a non-empty array' })
  }
  if (!checkRateLimit(api_key)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 20 requests per minute.' })
  }

  const handler = platformHandlers[platform] || callGeneric
  const platformName = platform || 'Unknown'
  const sanitizedPrompt = sanitizeInput(system_prompt || 'You are a helpful AI agent.')

  try {
    console.log(`🤖 [${platformName}] Model: ${model || 'default'} — Generating...`)
    const response = await handler(api_key, sanitizedPrompt, messages, model)
    console.log(`✅ [${platformName}] Response: ${response.length} chars`)
    res.json({ response })
  } catch (err) {
    console.error(`❌ [${platformName}] Error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════
// HELPER: Create Supabase client (service role — bypasses RLS)
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required for background operations')
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

function createSupabaseClient(supabase_url, supabase_key) {
  // Always use service role key for server operations (bypasses RLS)
  return getServiceClient()
}

// ═══════════════════════════════════════════════════════
// HELPER: Build system prompt (mirrors Session.jsx)
// ═══════════════════════════════════════════════════════

const MAX_AUTO_TURNS = 10
const MAX_TOTAL_MESSAGES = 24
const RESPONSE_DELAY_MS = 2000

function buildSystemPrompt(agent, turnNumber, totalMessages, maxTurns) {
  const turnsLeft = maxTurns - turnNumber
  return `You are "${agent.agent_name}", an AI agent representing ${agent.company}.
You are a ${agent.agent_type} agent running on ${agent.llm_platform}.
You are communicating through Agent OnBoard, a secure handshake layer between AI agents by Auwire Technologies.

CONVERSATION STATUS:
- This is your turn #${turnNumber} out of ${maxTurns} maximum turns.
- Total messages in session: ${totalMessages}
- You have ${turnsLeft} turns remaining.
${turnsLeft <= 2 ? '- WARNING: YOU ARE RUNNING LOW ON TURNS. Begin wrapping up the conversation NOW.' : ''}
${turnsLeft <= 0 ? '- THIS IS YOUR FINAL TURN. You MUST conclude the conversation.' : ''}

RULES:
- Be professional and concise
- Stay in character as ${agent.agent_name}
- Only discuss topics relevant to your role as a ${agent.agent_type} agent
- Be helpful and collaborative
- Keep responses under 120 words
- DO NOT repeat what has already been discussed
- DO NOT ask open-ended questions after turn 6 — start summarizing and concluding
- After turn 8 or when the conversation has reached a natural conclusion, end your message with [SESSION_COMPLETE] on its own line
- If you have ${turnsLeft <= 1 ? 'no' : turnsLeft} turns left, you MUST end with [SESSION_COMPLETE]
- [SESSION_COMPLETE] signals the session is done and will auto-close it
${agent.soul_md ? `\nYOUR IDENTITY FILE (soul.md):\n${agent.soul_md}\n` : ''}${agent.skill_md ? `\nYOUR CAPABILITIES FILE (skill.md):\n${agent.skill_md}\n` : ''}`
}

// ═══════════════════════════════════════════════════════
// AUTO-CONVERSE: Single turn of background conversation
// ═══════════════════════════════════════════════════════

app.post('/api/auto-converse', async (req, res) => {
  const { connection_id, supabase_url, supabase_key } = req.body
  if (!connection_id) return res.status(400).json({ error: 'Missing connection_id' })

  try {
    const sb = createSupabaseClient(supabase_url, supabase_key)

    // 1. Load connection with both agents
    const { data: conn, error: connErr } = await sb
      .from('connections')
      .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
      .eq('id', connection_id)
      .single()

    if (connErr || !conn) return res.status(404).json({ error: 'Connection not found' })
    if (conn.status !== 'approved') return res.json({ status: 'skipped', reason: 'not_approved' })

    const agentA = conn.requester
    const agentB = conn.target

    // 2. Load message history
    const { data: messages } = await sb
      .from('messages')
      .select('*')
      .eq('connection_id', connection_id)
      .order('created_at', { ascending: true })

    const msgs = messages || []
    const totalMessages = msgs.length

    // 3. Loop protection: max total messages
    if (totalMessages >= MAX_TOTAL_MESSAGES) {
      await sb.from('connections').update({ status: 'completed' }).eq('id', connection_id)
      await sb.from('audit_log').insert({ connection_id, agent_id: agentA.id, action: 'session_completed', metadata: { reason: 'max_messages_reached', total: totalMessages } })
      return res.json({ status: 'completed', reason: 'max_messages_reached', turn: totalMessages })
    }

    // 4. Determine whose turn it is
    let respondingAgent, otherAgent
    if (msgs.length === 0) {
      // First message: requester starts
      respondingAgent = agentA
      otherAgent = agentB
    } else {
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg.sender_agent_id === agentA.id) {
        respondingAgent = agentB
        otherAgent = agentA
      } else {
        respondingAgent = agentA
        otherAgent = agentB
      }
    }

    // 5. Per-agent turn cap
    const myTurns = msgs.filter(m => m.sender_agent_id === respondingAgent.id).length
    if (myTurns >= MAX_AUTO_TURNS) {
      await sb.from('connections').update({ status: 'completed' }).eq('id', connection_id)
      await sb.from('audit_log').insert({ connection_id, agent_id: respondingAgent.id, action: 'session_completed', metadata: { reason: 'max_turns_reached', turns: myTurns } })
      return res.json({ status: 'completed', reason: 'max_turns_reached', turn: myTurns })
    }

    // 6. Check agent has API key
    if (!respondingAgent.llm_api_key) {
      return res.json({ status: 'skipped', reason: 'no_api_key', agent: respondingAgent.agent_name })
    }

    // 7. Rate limit check
    if (!checkRateLimit(respondingAgent.llm_api_key)) {
      return res.status(429).json({ error: 'Rate limit exceeded' })
    }

    // 8. Build conversation for LLM
    const approvedMsgs = msgs
      .filter(m => m.approved)
      .map(m => ({
        role: m.sender_agent_id === respondingAgent.id ? 'assistant' : 'user',
        content: m.content
      }))

    if (approvedMsgs.length === 0) {
      approvedMsgs.push({ role: 'user', content: 'Hello, I would like to connect and collaborate.' })
    }

    // 9. Generate response
    const handler = platformHandlers[respondingAgent.llm_platform] || callGeneric
    const systemPrompt = buildSystemPrompt(respondingAgent, myTurns + 1, totalMessages, MAX_AUTO_TURNS)

    console.log(`🤖 [auto-converse] ${respondingAgent.agent_name} (${respondingAgent.llm_platform}) turn ${myTurns + 1}`)
    const response = await handler(respondingAgent.llm_api_key, systemPrompt, approvedMsgs, respondingAgent.llm_model)

    // 10. Check for session complete
    const isComplete = response.includes('[SESSION_COMPLETE]')
    const cleanResponse = response.replace(/\[SESSION_COMPLETE\]/g, '').trim()

    // 11. Insert message
    await sb.from('messages').insert({
      connection_id,
      sender_agent_id: respondingAgent.id,
      content: cleanResponse,
      message_type: 'agent_response',
      approved: true,
    })

    // 12. Log audit
    await sb.from('audit_log').insert({
      connection_id,
      agent_id: respondingAgent.id,
      action: 'message_sent',
      metadata: { source: 'background_auto_converse', turn: myTurns + 1 }
    })

    console.log(`✅ [auto-converse] ${respondingAgent.agent_name} responded (turn ${myTurns + 1}/${MAX_AUTO_TURNS})`)

    // 13. Complete session if needed
    if (isComplete) {
      await sb.from('connections').update({ status: 'completed' }).eq('id', connection_id)
      await sb.from('audit_log').insert({
        connection_id,
        agent_id: respondingAgent.id,
        action: 'session_completed',
        metadata: { reason: 'conversation_concluded', turns: myTurns + 1 }
      })
      return res.json({ status: 'completed', reason: 'conversation_concluded', turn: myTurns + 1 })
    }

    return res.json({ status: 'responded', turn: myTurns + 1 })
  } catch (err) {
    console.error('❌ [auto-converse] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════
// GENERATE REPORT: Post-session workflow report
// ═══════════════════════════════════════════════════════

app.post('/api/generate-report', async (req, res) => {
  const { connection_id, supabase_url, supabase_key } = req.body
  if (!connection_id) return res.status(400).json({ error: 'Missing connection_id' })

  try {
    const sb = createSupabaseClient(supabase_url, supabase_key)

    // Load connection + agents
    const { data: conn } = await sb
      .from('connections')
      .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
      .eq('id', connection_id)
      .single()

    if (!conn) return res.status(404).json({ error: 'Connection not found' })

    const agentA = conn.requester
    const agentB = conn.target

    // Load messages
    const { data: msgs } = await sb
      .from('messages')
      .select('*')
      .eq('connection_id', connection_id)
      .order('created_at', { ascending: true })

    if (!msgs || msgs.length === 0) {
      return res.json({ report: null, reason: 'no_messages' })
    }

    // Use agent A's API key for report generation
    const reportAgent = agentA.llm_api_key ? agentA : (agentB.llm_api_key ? agentB : null)
    if (!reportAgent) {
      return res.json({ report: null, reason: 'no_api_key' })
    }

    // Build conversation text
    const convoText = msgs.map(m => {
      const sender = m.sender_agent_id === agentA.id ? agentA.agent_name : agentB.agent_name
      return `${sender}: ${m.content}`
    }).join('\n\n')

    const reportPrompt = `You are a business analyst generating a structured workflow report for Agent OnBoard by Auwire Technologies.

Analyze this agent-to-agent conversation and return ONLY valid JSON (no markdown, no code fences) with this exact structure:

{
  "summary": "2-3 sentence summary of what happened",
  "outcome": "agreement|referral|no-match|follow-up-needed|information-exchanged|partnership-formed",
  "key_topics": ["topic1", "topic2"],
  "action_items": [
    { "owner": "Agent/Company name", "action": "What they need to do", "deadline": "suggested timeline" }
  ],
  "workflow_next_steps": [
    { "step": 1, "description": "What happens next", "responsible": "who" }
  ],
  "recommendation": "1 sentence recommendation",
  "follow_up_date": "suggested follow-up date",
  "risk_flags": ["any concerns or risks noted"]
}

CONNECTION DETAILS:
- Agent 1: ${agentA.agent_name} (${agentA.company}) — ${agentA.agent_type}
- Agent 2: ${agentB.agent_name} (${agentB.company}) — ${agentB.agent_type}
- Status: ${conn.status}
- Started: ${conn.created_at}
- Purpose: ${conn.purpose || 'Not specified'}
- Total messages: ${msgs.length}

FULL CONVERSATION:
${convoText}

Return ONLY the JSON object, nothing else.`

    const handler = platformHandlers[reportAgent.llm_platform] || callGeneric
    console.log(`📊 [generate-report] Using ${reportAgent.agent_name} (${reportAgent.llm_platform}) for report`)
    const response = await handler(reportAgent.llm_api_key, reportPrompt, [{ role: 'user', content: 'Generate the workflow report JSON now.' }], reportAgent.llm_model)

    // Parse JSON from response
    let report
    try {
      // Try to extract JSON from the response (handle markdown code fences)
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      report = JSON.parse(jsonMatch ? jsonMatch[0] : response)
    } catch (parseErr) {
      console.warn('⚠️ [generate-report] Could not parse JSON, storing raw response')
      report = {
        summary: response,
        outcome: 'unknown',
        key_topics: [],
        action_items: [],
        workflow_next_steps: [],
        recommendation: '',
        follow_up_date: '',
        risk_flags: []
      }
    }

    // Store report in audit_log
    await sb.from('audit_log').insert({
      connection_id,
      agent_id: reportAgent.id,
      action: 'session_report',
      metadata: report
    })

    console.log(`✅ [generate-report] Report generated and stored for connection ${connection_id.slice(0, 8)}`)
    return res.json({ report })
  } catch (err) {
    console.error('❌ [generate-report] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════
// RUN SESSION: Full background conversation loop
// ═══════════════════════════════════════════════════════

app.post('/api/run-session', async (req, res) => {
  const { connection_id, supabase_url, supabase_key } = req.body
  if (!connection_id) return res.status(400).json({ error: 'Missing connection_id' })

  console.log(`🚀 [run-session] Starting background conversation for ${connection_id.slice(0, 8)}`)

  // Respond immediately, run conversation in background
  res.json({ status: 'started', connection_id })

  try {
    const sb = createSupabaseClient(supabase_url, supabase_key)
    let turnCount = 0
    let sessionStatus = 'responded'

    while (sessionStatus === 'responded' && turnCount < MAX_TOTAL_MESSAGES) {
      // Delay between turns
      if (turnCount > 0) {
        await new Promise(r => setTimeout(r, RESPONSE_DELAY_MS))
      }

      try {
        // Re-check connection status before each turn
        const { data: freshConn } = await sb.from('connections').select('status').eq('id', connection_id).single()
        if (freshConn?.status !== 'approved') {
          console.log(`⏹️ [run-session] Session no longer approved, stopping`)
          break
        }

        // Call auto-converse internally (not via HTTP, just reuse the logic)
        const converseResult = await autoConverseInternal(connection_id, sb)
        sessionStatus = converseResult.status
        turnCount++

        console.log(`   [run-session] Turn ${turnCount}: ${converseResult.status} ${converseResult.reason || ''}`)
      } catch (turnErr) {
        console.error(`   [run-session] Turn ${turnCount} error:`, turnErr.message)
        break
      }
    }

    // Generate report if session completed
    if (sessionStatus === 'completed') {
      console.log(`📊 [run-session] Session completed, generating report...`)
      try {
        await generateReportInternal(connection_id, sb)
      } catch (reportErr) {
        console.error(`⚠️ [run-session] Report generation failed:`, reportErr.message)
      }
    }

    console.log(`✅ [run-session] Finished. ${turnCount} turns, status: ${sessionStatus}`)
  } catch (err) {
    console.error('❌ [run-session] Error:', err.message)
  }
})

// ─── Internal auto-converse (no HTTP overhead) ─────────
async function autoConverseInternal(connection_id, sb) {
  // Load connection with both agents
  const { data: conn } = await sb
    .from('connections')
    .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
    .eq('id', connection_id)
    .single()

  if (!conn) throw new Error('Connection not found')
  if (conn.status !== 'approved') return { status: 'skipped', reason: 'not_approved' }

  const agentA = conn.requester
  const agentB = conn.target

  // Load messages
  const { data: messages } = await sb
    .from('messages')
    .select('*')
    .eq('connection_id', connection_id)
    .order('created_at', { ascending: true })

  const msgs = messages || []
  const totalMessages = msgs.length

  // Max total messages
  if (totalMessages >= MAX_TOTAL_MESSAGES) {
    await sb.from('connections').update({ status: 'completed' }).eq('id', connection_id)
    await sb.from('audit_log').insert({ connection_id, agent_id: agentA.id, action: 'session_completed', metadata: { reason: 'max_messages_reached', total: totalMessages } })
    return { status: 'completed', reason: 'max_messages_reached' }
  }

  // Determine whose turn
  let respondingAgent
  if (msgs.length === 0) {
    respondingAgent = agentA
  } else {
    const lastMsg = msgs[msgs.length - 1]
    respondingAgent = lastMsg.sender_agent_id === agentA.id ? agentB : agentA
  }

  // Per-agent turn cap
  const myTurns = msgs.filter(m => m.sender_agent_id === respondingAgent.id).length
  if (myTurns >= MAX_AUTO_TURNS) {
    await sb.from('connections').update({ status: 'completed' }).eq('id', connection_id)
    await sb.from('audit_log').insert({ connection_id, agent_id: respondingAgent.id, action: 'session_completed', metadata: { reason: 'max_turns_reached', turns: myTurns } })
    return { status: 'completed', reason: 'max_turns_reached' }
  }

  // No API key
  if (!respondingAgent.llm_api_key) {
    return { status: 'skipped', reason: 'no_api_key' }
  }

  // Build conversation
  const approvedMsgs = msgs.filter(m => m.approved).map(m => ({
    role: m.sender_agent_id === respondingAgent.id ? 'assistant' : 'user',
    content: m.content
  }))
  if (approvedMsgs.length === 0) {
    approvedMsgs.push({ role: 'user', content: 'Hello, I would like to connect and collaborate.' })
  }

  // Generate response
  const handler = platformHandlers[respondingAgent.llm_platform] || callGeneric
  const systemPrompt = buildSystemPrompt(respondingAgent, myTurns + 1, totalMessages, MAX_AUTO_TURNS)
  const response = await handler(respondingAgent.llm_api_key, systemPrompt, approvedMsgs, respondingAgent.llm_model)

  const isComplete = response.includes('[SESSION_COMPLETE]')
  const cleanResponse = response.replace(/\[SESSION_COMPLETE\]/g, '').trim()

  // Insert message
  await sb.from('messages').insert({
    connection_id,
    sender_agent_id: respondingAgent.id,
    content: cleanResponse,
    message_type: 'agent_response',
    approved: true,
  })

  // Audit
  await sb.from('audit_log').insert({
    connection_id,
    agent_id: respondingAgent.id,
    action: 'message_sent',
    metadata: { source: 'background_auto_converse', turn: myTurns + 1 }
  })

  if (isComplete) {
    await sb.from('connections').update({ status: 'completed' }).eq('id', connection_id)
    await sb.from('audit_log').insert({
      connection_id,
      agent_id: respondingAgent.id,
      action: 'session_completed',
      metadata: { reason: 'conversation_concluded', turns: myTurns + 1 }
    })
    return { status: 'completed', reason: 'conversation_concluded' }
  }

  return { status: 'responded', turn: myTurns + 1 }
}

// ─── Internal report generation ────────────────────────
async function generateReportInternal(connection_id, sb) {
  const { data: conn } = await sb
    .from('connections')
    .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
    .eq('id', connection_id)
    .single()

  if (!conn) return null

  const agentA = conn.requester
  const agentB = conn.target

  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .eq('connection_id', connection_id)
    .order('created_at', { ascending: true })

  if (!msgs || msgs.length === 0) return null

  const reportAgent = agentA.llm_api_key ? agentA : (agentB.llm_api_key ? agentB : null)
  if (!reportAgent) return null

  const convoText = msgs.map(m => {
    const sender = m.sender_agent_id === agentA.id ? agentA.agent_name : agentB.agent_name
    return `${sender}: ${m.content}`
  }).join('\n\n')

  const reportPrompt = `You are a business analyst generating a structured workflow report for Agent OnBoard by Auwire Technologies.

Analyze this agent-to-agent conversation and return ONLY valid JSON (no markdown, no code fences) with this exact structure:

{
  "summary": "2-3 sentence summary of what happened",
  "outcome": "agreement|referral|no-match|follow-up-needed|information-exchanged|partnership-formed",
  "key_topics": ["topic1", "topic2"],
  "action_items": [
    { "owner": "Agent/Company name", "action": "What they need to do", "deadline": "suggested timeline" }
  ],
  "workflow_next_steps": [
    { "step": 1, "description": "What happens next", "responsible": "who" }
  ],
  "recommendation": "1 sentence recommendation",
  "follow_up_date": "suggested follow-up date",
  "risk_flags": ["any concerns or risks noted"]
}

CONNECTION DETAILS:
- Agent 1: ${agentA.agent_name} (${agentA.company}) — ${agentA.agent_type}
- Agent 2: ${agentB.agent_name} (${agentB.company}) — ${agentB.agent_type}
- Status: ${conn.status}
- Started: ${conn.created_at}
- Purpose: ${conn.purpose || 'Not specified'}
- Total messages: ${msgs.length}

FULL CONVERSATION:
${convoText}

Return ONLY the JSON object, nothing else.`

  const handler = platformHandlers[reportAgent.llm_platform] || callGeneric
  const response = await handler(reportAgent.llm_api_key, reportPrompt, [{ role: 'user', content: 'Generate the workflow report JSON now.' }], reportAgent.llm_model)

  let report
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    report = JSON.parse(jsonMatch ? jsonMatch[0] : response)
  } catch {
    report = {
      summary: response,
      outcome: 'unknown',
      key_topics: [],
      action_items: [],
      workflow_next_steps: [],
      recommendation: '',
      follow_up_date: '',
      risk_flags: []
    }
  }

  await sb.from('audit_log').insert({
    connection_id,
    agent_id: reportAgent.id,
    action: 'session_report',
    metadata: report
  })

  console.log(`✅ [generate-report] Report stored for ${connection_id.slice(0, 8)}`)
  return report
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', platforms: Object.keys(platformHandlers).length })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`\n🔌 Agent OnBoard API Proxy — by Auwire Technologies`)
  console.log(`   Running on http://localhost:${PORT}`)
  console.log(`   Platforms: ${Object.keys(platformHandlers).length}`)
  console.log(`   Endpoints: /api/agent-respond, /api/auto-converse, /api/run-session, /api/generate-report`)
  console.log(`   ${Object.keys(platformHandlers).join(', ')}\n`)
})
