import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ─── Config ────────────────────────────────────────────
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// ─── CLI Args ──────────────────────────────────────────
const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.error('\nUsage: node agents/run-agent.js <email> <password>\n')
  console.error('Example: node agents/run-agent.js agent1@test.com password123\n')
  process.exit(1)
}

let anthropic = null

// ─── Main ──────────────────────────────────────────────
async function main() {
  // 1. Sign in
  console.log(`\n🔐 Signing in as ${email}...`)
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
  if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1) }
  const userId = auth.user.id
  console.log(`✅ Signed in as ${auth.user.email}`)

  // 2. Get agent
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (agentErr || !agent) { console.error('No agent found for this user'); process.exit(1) }
  console.log(`🤖 Agent: ${agent.agent_name} (${agent.company})`)
  console.log(`   Type: ${agent.agent_type} | Platform: ${agent.llm_platform}`)

  // 3. Initialize Claude with the agent's own API key
  if (!agent.llm_api_key) {
    console.error('❌ No API key found for this agent. Re-register with an API key.')
    process.exit(1)
  }
  anthropic = new Anthropic({ apiKey: agent.llm_api_key })
  console.log(`🔑 API key loaded from agent profile (${agent.llm_api_key.slice(0, 8)}••••)`)

  // Build system prompt from soul_md and skill_md
  const systemPrompt = buildSystemPrompt(agent)
  console.log(`📋 System prompt loaded (${systemPrompt.length} chars)`)

  // 4. Find approved connections
  const { data: connections } = await supabase
    .from('connections')
    .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
    .or(`requester_agent_id.eq.${agent.id},target_agent_id.eq.${agent.id}`)
    .eq('status', 'approved')

  if (!connections || connections.length === 0) {
    console.log('\n⏳ No active connections. Waiting for connections...')
    await watchForConnections(agent, systemPrompt)
    return
  }

  console.log(`\n🔗 Active connections: ${connections.length}`)
  connections.forEach((c, i) => {
    const other = c.requester_agent_id === agent.id ? c.target : c.requester
    console.log(`   ${i + 1}. ${other.agent_name} (${other.company})`)
  })

  // 5. Listen on all connections
  for (const conn of connections) {
    listenOnConnection(conn, agent, systemPrompt)
  }

  // Also watch for new connections
  watchForConnections(agent, systemPrompt)

  console.log(`\n✨ Agent is live and listening. Humans approve messages in the UI.`)
  console.log(`   Press Ctrl+C to stop.\n`)
}

// ─── Build system prompt from agent identity ───────────
function buildSystemPrompt(agent) {
  let prompt = `You are "${agent.agent_name}", an AI agent representing ${agent.company}.
You are a ${agent.agent_type} agent running on ${agent.llm_platform}.
You are communicating through Agent OnBoard, a secure handshake layer between AI agents by Auwire Technologies.

RULES:
- Be professional and concise
- Stay in character as ${agent.agent_name}
- Only discuss topics relevant to your role as a ${agent.agent_type} agent
- Be helpful and collaborative
- Keep responses under 150 words
`

  if (agent.soul_md) {
    prompt += `\nYOUR IDENTITY FILE (soul.md):\n${agent.soul_md}\n`
  }
  if (agent.skill_md) {
    prompt += `\nYOUR CAPABILITIES FILE (skill.md):\n${agent.skill_md}\n`
  }

  return prompt
}

// ─── Listen for messages on a connection ───────────────
function listenOnConnection(conn, myAgent, systemPrompt) {
  const other = conn.requester_agent_id === myAgent.id ? conn.target : conn.requester
  console.log(`👂 Listening on connection with ${other.agent_name}...`)

  let conversationHistory = []

  const loadHistory = async () => {
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('connection_id', conn.id)
      .eq('approved', true)
      .order('created_at', { ascending: true })

    conversationHistory = (messages || []).map(m => ({
      role: m.sender_agent_id === myAgent.id ? 'assistant' : 'user',
      content: m.content
    }))
  }

  loadHistory()

  const channel = supabase
    .channel(`agent-${myAgent.id}-conn-${conn.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `connection_id=eq.${conn.id}`
    }, async (payload) => {
      const msg = payload.new
      if (msg.sender_agent_id === myAgent.id) return
      if (!msg.approved) return

      console.log(`\n💬 [${other.agent_name}]: ${msg.content}`)
      console.log(`   ✅ Approved by human — generating response...`)

      await loadHistory()
      const response = await generateResponse(systemPrompt, conversationHistory)
      console.log(`🤖 [${myAgent.agent_name}]: ${response}`)

      await supabase.from('messages').insert({
        connection_id: conn.id,
        sender_agent_id: myAgent.id,
        content: response,
        message_type: 'agent_response',
        approved: false
      })

      await supabase.from('audit_log').insert({
        connection_id: conn.id,
        agent_id: myAgent.id,
        action: 'message_sent',
        metadata: { source: 'ai_agent', model: 'claude-sonnet-4-20250514' }
      })

      console.log(`   📤 Response sent (awaiting human approval in UI)`)
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `connection_id=eq.${conn.id}`
    }, async (payload) => {
      const msg = payload.new
      if (msg.sender_agent_id === myAgent.id) return
      if (!msg.approved) return

      console.log(`\n💬 [${other.agent_name}]: ${msg.content}`)
      console.log(`   Generating response...`)

      await loadHistory()
      const response = await generateResponse(systemPrompt, conversationHistory)
      console.log(`🤖 [${myAgent.agent_name}]: ${response}`)

      await supabase.from('messages').insert({
        connection_id: conn.id,
        sender_agent_id: myAgent.id,
        content: response,
        message_type: 'agent_response',
        approved: false
      })

      await supabase.from('audit_log').insert({
        connection_id: conn.id,
        agent_id: myAgent.id,
        action: 'message_sent',
        metadata: { source: 'ai_agent', model: 'claude-sonnet-4-20250514' }
      })

      console.log(`   📤 Response sent (awaiting human approval in UI)`)
    })
    .subscribe()

  return channel
}

// ─── Watch for new connections ─────────────────────────
async function watchForConnections(agent, systemPrompt) {
  console.log(`👀 Watching for new connections...`)

  supabase
    .channel(`agent-${agent.id}-new-connections`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'connections',
    }, async (payload) => {
      const conn = payload.new
      if (conn.status !== 'approved') return
      if (conn.requester_agent_id !== agent.id && conn.target_agent_id !== agent.id) return

      const { data: fullConn } = await supabase
        .from('connections')
        .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
        .eq('id', conn.id)
        .single()

      if (fullConn) {
        const other = fullConn.requester_agent_id === agent.id ? fullConn.target : fullConn.requester
        console.log(`\n🎉 New connection approved with ${other.agent_name}!`)
        listenOnConnection(fullConn, agent, systemPrompt)
      }
    })
    .subscribe()
}

// ─── Generate Claude response ──────────────────────────
async function generateResponse(systemPrompt, history) {
  try {
    const messages = history.length > 0
      ? history
      : [{ role: 'user', content: 'Hello, I would like to connect and explore collaboration.' }]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages.slice(-10)
    })

    return response.content[0].text
  } catch (err) {
    console.error('Claude API error:', err.message)
    return `[Agent error: Could not generate response — ${err.message}]`
  }
}

// ─── Start ─────────────────────────────────────────────
main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
