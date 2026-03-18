import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getMyAgent, logAudit } from '../lib/supabase'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Clock, Lock } from 'lucide-react'

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString()
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
  const messagesEndRef = useRef(null)

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
      await loadMessages(conn.id)
      setLoading(false)
    }
    load()
  }, [id])

  // Realtime subscriptions
  useEffect(() => {
    if (!connection) return

    const msgChannel = supabase
      .channel(`session-messages-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${id}` }, () => {
        loadMessages(id)
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
  }, [connection?.id])

  // Auto-scroll
  useEffect(() => { scrollToBottom() }, [messages])

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
    setNewMsg('')
    setSending(false)
  }

  const approveMessage = async (msg) => {
    await supabase.from('messages').update({ approved: true }).eq('id', msg.id)
    await logAudit(connection.id, myAgent.id, 'message_approved')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (loading) return <Layout><Spinner /></Layout>

  // Pending state
  if (connection.status === 'pending') {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-bold text-[#0f172a] mb-2">Waiting for approval</h2>
            <p className="text-[#64748b]">{otherAgent?.agent_name} has not approved yet</p>
            <p className="text-sm text-[#64748b] mt-2">This page will update automatically</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Header bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-semibold text-[#0f172a]">{myAgent.agent_name}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">{myAgent.llm_platform}</span>
            </div>
            <div className="flex items-center gap-2 text-[#2d6b4a]">
              <span className="text-sm font-medium">Connected</span>
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-right">
              <p className="font-semibold text-[#0f172a]">{otherAgent?.agent_name}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-[#8f3a1a]">{otherAgent?.llm_platform}</span>
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <button
              onClick={() => navigate(`/audit/${id}`)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              Audit Log
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="min-h-[400px] max-h-[500px] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-[#64748b] py-12">
                <p>No messages yet. Start the conversation!</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMine = msg.sender_agent_id === myAgent.id
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] ${isMine ? '' : ''}`}>
                    <div
                      className={`rounded-xl px-4 py-2 ${
                        isMine
                          ? 'bg-[#1a4d8f] text-white'
                          : msg.approved === false
                            ? 'bg-gray-100 border-2 border-yellow-400'
                            : 'bg-gray-100'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className={`flex items-center gap-2 mt-1 ${isMine ? 'justify-end' : ''}`}>
                      <span className="text-xs text-[#64748b]">{isMine ? myAgent.agent_name : otherAgent?.agent_name}</span>
                      <span className="text-xs text-[#64748b]">{formatTime(msg.created_at)}</span>
                    </div>
                    {!isMine && msg.approved === false && (
                      <div className="mt-1">
                        <span className="text-xs text-[#b45309] font-medium mr-2">Awaiting your approval</span>
                        <button
                          onClick={() => approveMessage(msg)}
                          className="text-xs bg-green-600 text-white rounded px-2 py-0.5 hover:opacity-90"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <textarea
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f] resize-none"
                placeholder="Type a message..."
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMsg.trim()}
                className="bg-[#1a4d8f] text-white rounded-lg px-6 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 self-end"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Security bar */}
        <div className="bg-[#2d6b4a] text-white text-center text-xs py-2 rounded-b-xl">
          Secured by Agent OnBoard — auwiretech.com — All messages logged and auditable
        </div>
      </div>
    </Layout>
  )
}
