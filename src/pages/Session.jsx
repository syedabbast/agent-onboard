import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getMyAgent, logAudit, sendNotification, timeAgo } from '../lib/supabase'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Clock, Lock, Bot, XCircle, AlertTriangle, CheckCircle } from 'lucide-react'

const API_URL = 'http://localhost:3001'
const MAX_AUTO_TURNS = 10 // Max messages each agent can auto-send
const MAX_TOTAL_MESSAGES = 24 // Hard cap on total messages before auto-close
const RESPONSE_DELAY_MS = 2000 // Delay before auto-responding

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString()
}

function buildSystemPrompt(agent, turnNumber, totalMessages, maxTurns) {
  const turnsLeft = maxTurns - turnNumber
  let prompt = `You are "${agent.agent_name}", an AI agent representing ${agent.company}.
You are a ${agent.agent_type} agent running on ${agent.llm_platform}.
You are communicating through Agent OnBoard, a secure handshake layer between AI agents by Auwire Technologies.

CONVERSATION STATUS:
- This is your turn #${turnNumber} out of ${maxTurns} maximum turns.
- Total messages in session: ${totalMessages}
- You have ${turnsLeft} turns remaining.
${turnsLeft <= 2 ? '- ⚠️ YOU ARE RUNNING LOW ON TURNS. Begin wrapping up the conversation NOW.' : ''}
${turnsLeft <= 0 ? '- ❌ THIS IS YOUR FINAL TURN. You MUST conclude the conversation.' : ''}

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
`
  if (agent.soul_md) prompt += `\nYOUR IDENTITY FILE (soul.md):\n${agent.soul_md}\n`
  if (agent.skill_md) prompt += `\nYOUR CAPABILITIES FILE (skill.md):\n${agent.skill_md}\n`
  return prompt
}

function SessionSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-5 bg-[#f5f5f7] rounded-xl w-32 mb-2" />
            <div className="h-4 bg-[#f5f5f7] rounded-full w-20" />
          </div>
          <div className="h-4 bg-[#f5f5f7] rounded-xl w-24" />
          <div className="text-right">
            <div className="h-5 bg-[#f5f5f7] rounded-xl w-32 mb-2 ml-auto" />
            <div className="h-4 bg-[#f5f5f7] rounded-full w-20 ml-auto" />
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
        <div className="min-h-[400px] p-6 space-y-4">
          <div className="flex justify-start">
            <div className="h-12 bg-[#f5f5f7] rounded-2xl w-2/3" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 bg-[#0071e3]/10 rounded-2xl w-1/2" />
          </div>
          <div className="flex justify-start">
            <div className="h-16 bg-[#f5f5f7] rounded-2xl w-3/5" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Session() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState(null)
  const [myAgent, setMyAgent] = useState(null)
  const [otherAgent, setOtherAgent] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const messagesEndRef = useRef(null)
  const autoRespondingRef = useRef(false)
  const prevMessageCountRef = useRef(0)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadMessages = async (connId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('connection_id', connId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    return data || []
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      const { data: mine } = await getMyAgent(user.id)
      if (!mine) { navigate('/register'); return }
      setMyAgent(mine)

      const { data: conn } = await supabase
        .from('connections')
        .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
        .eq('id', id)
        .single()

      if (!conn || (conn.requester_agent_id !== mine.id && conn.target_agent_id !== mine.id)) {
        navigate('/')
        return
      }

      setConnection(conn)
      setOtherAgent(conn.requester_agent_id === mine.id ? conn.target : conn.requester)
      setAiMode(!!mine.llm_api_key)
      const msgs = await loadMessages(conn.id)
      prevMessageCountRef.current = msgs.length
      setLoading(false)

      // Auto-respond on session open if last message is from the other agent
      if (conn.status === 'approved' && msgs.length > 0 && mine.llm_api_key) {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.sender_agent_id !== mine.id) {
          setTimeout(() => triggerAutoRespond(msgs, mine, conn), 800)
        }
      }
    }
    load()
  }, [id])

  // Auto-respond logic with loop protection
  const triggerAutoRespond = async (currentMessages, agent, conn) => {
    if (!agent || !conn) return
    if (autoRespondingRef.current) return
    if (!agent.llm_api_key) return

    // Check if latest message is from the other agent
    const lastMsg = currentMessages[currentMessages.length - 1]
    if (!lastMsg || lastMsg.sender_agent_id === agent.id) return

    // --- LOOP PROTECTION ---
    const totalMessages = currentMessages.length
    const myTurns = currentMessages.filter(m => m.sender_agent_id === agent.id).length

    // Hard cap: too many total messages → auto-close
    if (totalMessages >= MAX_TOTAL_MESSAGES) {
      await supabase.from('connections').update({ status: 'completed' }).eq('id', conn.id)
      await logAudit(conn.id, agent.id, 'session_completed', { reason: 'max_messages_reached', total: totalMessages })
      toast.success('Session auto-completed — message limit reached', { icon: '✅', duration: 5000 })
      setConnection(prev => ({ ...prev, status: 'completed' }))
      return
    }

    // Per-agent turn cap
    if (myTurns >= MAX_AUTO_TURNS) {
      await supabase.from('connections').update({ status: 'completed' }).eq('id', conn.id)
      await logAudit(conn.id, agent.id, 'session_completed', { reason: 'max_turns_reached', turns: myTurns })
      toast.success('Session auto-completed — turn limit reached', { icon: '✅', duration: 5000 })
      setConnection(prev => ({ ...prev, status: 'completed' }))
      return
    }

    autoRespondingRef.current = true
    setAiThinking(true)

    // Delay to prevent rapid-fire loop
    await new Promise(resolve => setTimeout(resolve, RESPONSE_DELAY_MS))

    // Re-check connection status (might have been completed by the other side)
    const { data: freshConn } = await supabase.from('connections').select('status').eq('id', conn.id).single()
    if (freshConn?.status !== 'approved') {
      setAiThinking(false)
      autoRespondingRef.current = false
      return
    }

    const approvedMsgs = currentMessages
      .filter(m => m.approved)
      .map(m => ({
        role: m.sender_agent_id === agent.id ? 'assistant' : 'user',
        content: m.content
      }))

    if (approvedMsgs.length === 0) {
      approvedMsgs.push({ role: 'user', content: 'Hello, I would like to connect and collaborate.' })
    }

    try {
      const res = await fetch(`${API_URL}/api/agent-respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: agent.llm_api_key,
          platform: agent.llm_platform,
          system_prompt: buildSystemPrompt(agent, myTurns + 1, totalMessages, MAX_AUTO_TURNS),
          messages: approvedMsgs
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'API call failed')
      }

      const { response } = await res.json()

      // Check if conversation is concluded
      const isComplete = response.includes('[SESSION_COMPLETE]')
      const cleanResponse = response.replace(/\[SESSION_COMPLETE\]/g, '').trim()

      await supabase.from('messages').insert({
        connection_id: conn.id,
        sender_agent_id: agent.id,
        content: cleanResponse,
        message_type: 'agent_response',
        approved: true,
      })

      await logAudit(conn.id, agent.id, 'message_sent', { source: 'ai_auto_respond', turn: myTurns + 1 })
      toast.success(`Agent responded (turn ${myTurns + 1}/${MAX_AUTO_TURNS})`, { icon: '🤖' })

      // Auto-complete session if conversation concluded
      if (isComplete) {
        await supabase.from('connections').update({ status: 'completed' }).eq('id', conn.id)
        await logAudit(conn.id, agent.id, 'session_completed', { reason: 'conversation_concluded', turns: myTurns + 1 })
        toast.success('Session completed — conversation concluded', { icon: '✅', duration: 5000 })
        setConnection(prev => ({ ...prev, status: 'completed' }))
      }
    } catch (err) {
      console.warn('Auto-respond failed:', err.message)
    }

    setAiThinking(false)
    autoRespondingRef.current = false
  }

  // Wrapper that checks localStorage before calling triggerAutoRespond
  const handleAutoRespond = useCallback((currentMessages, agent, conn) => {
    const isAutoEnabled = localStorage.getItem(`llm_auto_${agent?.id}`) === 'true'
    if (!isAutoEnabled) return
    triggerAutoRespond(currentMessages, agent, conn)
  }, [])

  // Realtime subscriptions
  useEffect(() => {
    if (!connection) return

    const msgChannel = supabase
      .channel(`session-messages-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${id}` }, async () => {
        const newMsgs = await loadMessages(id)
        if (newMsgs.length > prevMessageCountRef.current && myAgent && connection) {
          const lastMsg = newMsgs[newMsgs.length - 1]
          if (lastMsg && lastMsg.sender_agent_id !== myAgent.id && myAgent.llm_api_key) {
            triggerAutoRespond(newMsgs, myAgent, connection)
          }
        }
        prevMessageCountRef.current = newMsgs.length
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `connection_id=eq.${id}` }, () => {
        loadMessages(id)
      })
      .subscribe()

    const connChannel = supabase
      .channel(`session-connection-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'connections', filter: `id=eq.${id}` }, async () => {
        const { data: updated } = await supabase.from('connections').select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
          .eq('id', id).single()
        if (updated) {
          setConnection(updated)
          if (updated.status === 'approved') toast.success('Connected!')
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(connChannel)
    }
  }, [connection?.id, myAgent?.id, handleAutoRespond])

  // Auto-scroll
  useEffect(() => { scrollToBottom() }, [messages])

  // Generate AI response using the agent's own API key
  const generateAiResponse = async () => {
    if (!myAgent.llm_api_key) {
      toast.error('No API key configured for your agent')
      return
    }

    setAiThinking(true)

    // Build conversation history from approved messages
    const approvedMsgs = messages
      .filter(m => m.approved)
      .map(m => ({
        role: m.sender_agent_id === myAgent.id ? 'assistant' : 'user',
        content: m.content
      }))

    if (approvedMsgs.length === 0) {
      approvedMsgs.push({ role: 'user', content: 'Hello, I would like to connect and collaborate.' })
    }

    try {
      const res = await fetch(`${API_URL}/api/agent-respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: myAgent.llm_api_key,
          platform: myAgent.llm_platform,
          system_prompt: buildSystemPrompt(myAgent),
          messages: approvedMsgs
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'API call failed')
      }

      const { response } = await res.json()

      // Insert as a message (approved=true since the human triggered it)
      await supabase.from('messages').insert({
        connection_id: connection.id,
        sender_agent_id: myAgent.id,
        content: response,
        message_type: 'agent_response',
        approved: true,
      })

      await logAudit(connection.id, myAgent.id, 'message_sent', { source: 'ai_agent' })
      toast.success('AI response sent!')

      // Send notification to the other agent
      if (otherAgent?.user_email) {
        sendNotification('new_message', otherAgent.user_email, myAgent.agent_name, myAgent.company, connection.id)
      }
    } catch (err) {
      toast.error(`AI error: ${err.message}`)
    }

    setAiThinking(false)
  }

  const sendMessage = async () => {
    if (!newMsg.trim() || sending) return
    setSending(true)
    await supabase.from('messages').insert({
      connection_id: connection.id,
      sender_agent_id: myAgent.id,
      content: newMsg.trim(),
      message_type: 'text',
      approved: true,
    })
    await logAudit(connection.id, myAgent.id, 'message_sent')

    // Send notification to the other agent
    if (otherAgent?.user_email) {
      sendNotification('new_message', otherAgent.user_email, myAgent.agent_name, myAgent.company, connection.id)
    }

    setNewMsg('')
    setSending(false)
  }

  const approveMessage = async (msg) => {
    await supabase.from('messages').update({ approved: true }).eq('id', msg.id)
    await logAudit(connection.id, myAgent.id, 'message_approved')
    toast.success('Message approved')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const revokeConnection = async () => {
    setRevoking(true)
    await supabase.from('connections').update({ status: 'revoked' }).eq('id', connection.id)
    await logAudit(connection.id, myAgent.id, 'connection_revoked')
    toast.success('Connection revoked')
    setShowRevokeModal(false)
    setRevoking(false)
    navigate('/')
  }

  if (loading) {
    return (
      <Layout>
        <SessionSkeleton />
      </Layout>
    )
  }

  // Completed state
  if (connection.status === 'completed') {
    return (
      <Layout activeAgentName={myAgent?.agent_name}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-[#34c759]/5 rounded-2xl p-8 text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-[#34c759]/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-[#1d1d1f] tracking-tight mb-2">Session Completed</h2>
            <p className="text-[#6e6e73] mb-2">This conversation has concluded successfully.</p>
            <p className="text-sm text-[#86868b] mb-6">All messages are preserved in the audit trail.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/')}
                className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Return to Dashboard
              </button>
              <button
                onClick={() => navigate(`/audit/${id}`)}
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-200"
              >
                View Audit Trail
              </button>
            </div>
          </div>

          {/* Show conversation history read-only */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-black/5">
              <p className="text-sm font-medium text-[#6e6e73] text-center">Conversation History</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto p-6 space-y-3">
              {messages.map((msg) => {
                const isMine = msg.sender_agent_id === myAgent.id
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[70%]">
                      <div className={`px-4 py-2.5 ${isMine ? 'bg-[#0071e3] text-white rounded-2xl rounded-br-md' : 'bg-[#f5f5f7] text-[#1d1d1f] rounded-2xl rounded-bl-md'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <div className={`flex items-center gap-2 mt-1 ${isMine ? 'justify-end' : ''}`}>
                        <span className="text-xs text-[#86868b]">{isMine ? myAgent.agent_name : otherAgent?.agent_name}</span>
                        <span className="text-xs text-[#86868b]">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  // Revoked state
  if (connection.status === 'revoked') {
    return (
      <Layout activeAgentName={myAgent?.agent_name}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-[#ff3b30]/5 rounded-2xl p-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-[#ff3b30] mb-4" />
            <h2 className="text-xl font-bold text-[#1d1d1f] tracking-tight mb-2">Connection Revoked</h2>
            <p className="text-[#6e6e73] mb-6">This connection has been revoked. No further messages can be sent.</p>
            <button
              onClick={() => navigate('/')}
              className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-200"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  // Pending state
  if (connection.status === 'pending') {
    return (
      <Layout activeAgentName={myAgent?.agent_name}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Clock className="w-16 h-16 mx-auto text-[#86868b]/30 mb-4" />
            <h2 className="text-xl font-bold text-[#1d1d1f] tracking-tight mb-2">Waiting for approval</h2>
            <p className="text-[#6e6e73]">{otherAgent?.agent_name} has not approved yet</p>
            <p className="text-sm text-[#86868b] mt-2">This page will update automatically</p>
          </div>
        </div>
      </Layout>
    )
  }

  const autoRespondEnabled = localStorage.getItem(`llm_auto_${myAgent?.id}`) === 'true'
  const myTurnCount = messages.filter(m => m.sender_agent_id === myAgent?.id).length
  const totalMsgCount = messages.length
  const turnsRemaining = MAX_AUTO_TURNS - myTurnCount
  const progressPct = Math.min((totalMsgCount / MAX_TOTAL_MESSAGES) * 100, 100)

  const endSession = async () => {
    await supabase.from('connections').update({ status: 'completed' }).eq('id', connection.id)
    await logAudit(connection.id, myAgent.id, 'session_completed', { reason: 'manual_end', turns: myTurnCount })
    toast.success('Session ended', { icon: '✅' })
    setConnection(prev => ({ ...prev, status: 'completed' }))
  }

  return (
    <Layout activeAgentName={myAgent?.agent_name}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header bar */}
        <div className="backdrop-blur-xl bg-white/90 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-semibold text-[#1d1d1f]">{myAgent.agent_name}</p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">{myAgent.llm_platform}</span>
            </div>
            <div className="flex items-center gap-2 text-[#34c759]">
              <span className="text-sm font-medium">Connected</span>
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-right">
              <p className="font-semibold text-[#1d1d1f]">{otherAgent?.agent_name}</p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ff9500]/10 text-[#ff9500]">{otherAgent?.llm_platform}</span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {myAgent.llm_api_key && (
                <>
                  <button
                    onClick={() => setAiMode(!aiMode)}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      aiMode
                        ? 'bg-[#34c759] text-white'
                        : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    AI Mode {aiMode ? 'ON' : 'OFF'}
                  </button>
                  {autoRespondEnabled && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">
                      <Bot className="w-3 h-3" />
                      Auto-Respond ON
                    </span>
                  )}
                  {aiMode && !autoRespondEnabled && <span className="text-xs text-[#86868b]">Your agent will think using Claude</span>}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRevokeModal(true)}
                className="text-[#ff3b30] hover:bg-[#ff3b30]/5 rounded-full px-4 py-1.5 text-xs font-medium flex items-center gap-1 transition-all duration-200"
              >
                <XCircle className="w-3.5 h-3.5" />
                Revoke Connection
              </button>
              <button
                onClick={() => navigate(`/audit/${id}`)}
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200"
              >
                Audit Log
              </button>
            </div>
          </div>
        </div>

        {/* Session Control Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#86868b]">Session progress</span>
                  <span className="text-xs font-medium text-[#1d1d1f]">{totalMsgCount} / {MAX_TOTAL_MESSAGES} messages</span>
                </div>
                <div className="w-full bg-[#f5f5f7] rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${progressPct >= 80 ? 'bg-[#ff9500]' : progressPct >= 100 ? 'bg-[#ff3b30]' : 'bg-[#0071e3]'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
              <div className="text-center px-3 border-l border-black/5">
                <p className="text-lg font-bold text-[#1d1d1f]">{turnsRemaining}</p>
                <p className="text-xs text-[#86868b]">turns left</p>
              </div>
            </div>
            <button
              onClick={endSession}
              className="bg-[#ff9500] hover:bg-[#e68600] text-white rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-1.5 flex-shrink-0"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              End Session
            </button>
          </div>
          {turnsRemaining <= 3 && turnsRemaining > 0 && (
            <p className="text-xs text-[#ff9500] mt-2">Your agent is wrapping up — {turnsRemaining} turn{turnsRemaining > 1 ? 's' : ''} remaining before auto-close.</p>
          )}
          {turnsRemaining <= 0 && (
            <p className="text-xs text-[#ff3b30] mt-2">Turn limit reached. Session will auto-close. You can still end it manually.</p>
          )}
        </div>

        {/* Messages */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="min-h-[400px] max-h-[500px] overflow-y-auto p-6 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-[#86868b] py-16">
                <p>No messages yet. Start the conversation!</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMine = msg.sender_agent_id === myAgent.id
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[70%]">
                    <div
                      className={`px-4 py-2.5 ${
                        isMine
                          ? 'bg-[#0071e3] text-white rounded-2xl rounded-br-md'
                          : msg.approved === false
                            ? 'bg-[#f5f5f7] border-2 border-[#ff9500] text-[#1d1d1f] rounded-2xl rounded-bl-md'
                            : 'bg-[#f5f5f7] text-[#1d1d1f] rounded-2xl rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className={`flex items-center gap-2 mt-1 ${isMine ? 'justify-end' : ''}`}>
                      <span className="text-xs text-[#86868b]">{isMine ? myAgent.agent_name : otherAgent?.agent_name}</span>
                      {msg.message_type === 'agent_response' && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-purple-600">
                          <Bot className="w-3 h-3" /> AI
                        </span>
                      )}
                      <span className="text-xs text-[#86868b]">{formatTime(msg.created_at)}</span>
                    </div>
                    {!isMine && msg.approved === false && (
                      <div className="mt-1">
                        <span className="text-xs text-[#ff9500] font-medium mr-2">Awaiting your approval</span>
                        <button
                          onClick={() => approveMessage(msg)}
                          className="text-xs bg-[#34c759] text-white rounded-full px-3 py-0.5 hover:bg-[#30b350] transition-all duration-200"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {aiThinking && (
              <div className="flex justify-end">
                <div className="bg-[#0071e3]/5 rounded-2xl rounded-br-md px-4 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-[#0071e3]">
                    <div className="w-4 h-4 border-2 border-[#0071e3]/20 border-t-[#0071e3] rounded-full animate-spin" />
                    {myAgent.agent_name} is thinking...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-black/5 p-4">
            {aiMode ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-purple-500/5 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Bot className="w-4 h-4" />
                    <span className="font-medium">AI Mode</span>
                    <span className="text-purple-500">— Your agent will respond using Claude based on conversation context</span>
                  </div>
                </div>
                <button
                  onClick={generateAiResponse}
                  disabled={aiThinking}
                  className="bg-[#34c759] hover:bg-[#30b350] text-white rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50 flex items-center gap-2 flex-shrink-0 transition-all duration-200"
                >
                  {aiThinking ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                  Let Agent Respond
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <textarea
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="flex-1 bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 resize-none transition-all duration-200"
                  placeholder="Type a message manually..."
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMsg.trim()}
                  className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50 self-end transition-all duration-200"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Security bar */}
        <div className="bg-[#1d1d1f] text-white/60 text-center text-xs py-2.5 rounded-b-2xl -mt-1">
          Secured by Agent OnBoard — auwiretech.com — All messages logged and auditable
        </div>
      </div>

      {/* Revoke Confirmation Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#ff3b30]/10 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-[#ff3b30]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#1d1d1f]">Revoke Connection</h3>
                <p className="text-sm text-[#6e6e73]">
                  This will end your connection with{' '}
                  <span className="font-medium text-[#1d1d1f]">{otherAgent?.agent_name}</span>
                </p>
              </div>
            </div>
            <p className="text-sm text-[#6e6e73] mb-6">
              This action cannot be undone. No further messages can be sent in this session.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRevokeModal(false)}
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={revokeConnection}
                disabled={revoking}
                className="bg-[#ff3b30] hover:bg-[#ff453a] text-white rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-all duration-200"
              >
                {revoking ? 'Revoking...' : 'Revoke Connection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
