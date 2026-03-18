import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

const app = express()
app.use(cors())
app.use(express.json())

// ─── Claude (Anthropic) ───────────────────────────────
async function callClaude(apiKey, systemPrompt, messages) {
  const anthropic = new Anthropic({ apiKey })
  const result = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: systemPrompt,
    messages: messages.slice(-10)
  })
  return result.content[0].text
}

// ─── OpenAI (GPT) / Microsoft Copilot ─────────────────
async function callOpenAI(apiKey, systemPrompt, messages) {
  const openai = new OpenAI({ apiKey })
  const result = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 300,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10)
    ]
  })
  return result.choices[0].message.content
}

// ─── Google Gemini ────────────────────────────────────
async function callGemini(apiKey, systemPrompt, messages) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt
  })

  // Convert messages to Gemini format
  const history = messages.slice(-10).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  // Last message must be from user
  const lastMsg = history.pop()
  const chat = model.startChat({ history })
  const result = await chat.sendMessage(lastMsg.parts[0].text)
  return result.response.text()
}

// ─── OpenClaw / LangChain / Other (OpenAI-compatible) ─
async function callOpenAICompatible(apiKey, systemPrompt, messages) {
  // Most open-source / alternative LLMs expose an OpenAI-compatible API
  const openai = new OpenAI({ apiKey })
  const result = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 300,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10)
    ]
  })
  return result.choices[0].message.content
}

// ─── Platform Router ──────────────────────────────────
const platformHandlers = {
  'Claude (Anthropic)': callClaude,
  'OpenAI (GPT)':       callOpenAI,
  'Microsoft Copilot':  callOpenAI,
  'Google Gemini':      callGemini,
  'OpenClaw':           callOpenAICompatible,
  'LangChain':          callOpenAICompatible,
  'Other':              callOpenAICompatible,
}

// POST /api/agent-respond
// Body: { api_key, platform, system_prompt, messages }
// Returns: { response: "..." }
app.post('/api/agent-respond', async (req, res) => {
  const { api_key, platform, system_prompt, messages } = req.body

  if (!api_key || !messages) {
    return res.status(400).json({ error: 'Missing api_key or messages' })
  }

  const handler = platformHandlers[platform] || callOpenAICompatible
  const platformName = platform || 'Unknown'

  try {
    console.log(`🤖 [${platformName}] Generating response...`)
    const response = await handler(api_key, system_prompt || 'You are a helpful AI agent.', messages)
    console.log(`✅ [${platformName}] Response generated (${response.length} chars)`)
    res.json({ response })
  } catch (err) {
    console.error(`❌ [${platformName}] Error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`\n🔌 Agent OnBoard API proxy running on http://localhost:${PORT}`)
  console.log(`   Supported platforms: ${Object.keys(platformHandlers).join(', ')}\n`)
})
