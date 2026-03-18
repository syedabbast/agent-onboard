import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(cors())
app.use(express.json())

// POST /api/agent-respond
// Body: { api_key, system_prompt, messages }
// Returns: { response: "..." }
app.post('/api/agent-respond', async (req, res) => {
  const { api_key, system_prompt, messages } = req.body

  if (!api_key || !messages) {
    return res.status(400).json({ error: 'Missing api_key or messages' })
  }

  try {
    const anthropic = new Anthropic({ apiKey: api_key })

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: system_prompt || 'You are a helpful AI agent.',
      messages: messages.slice(-10)
    })

    res.json({ response: result.content[0].text })
  } catch (err) {
    console.error('Claude API error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`\n🔌 Agent OnBoard API proxy running on http://localhost:${PORT}`)
  console.log(`   Proxies Claude API calls from the frontend.\n`)
})
