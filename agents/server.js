import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', platforms: Object.keys(platformHandlers).length })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`\n🔌 Agent OnBoard API Proxy — by Auwire Technologies`)
  console.log(`   Running on http://localhost:${PORT}`)
  console.log(`   Platforms: ${Object.keys(platformHandlers).length}`)
  console.log(`   ${Object.keys(platformHandlers).join(', ')}\n`)
})
