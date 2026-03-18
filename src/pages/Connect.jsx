import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase, getAgentByToken, getMyAgent, logAudit } from '../lib/supabase'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Shield } from 'lucide-react'

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Connect() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [targetAgent, setTargetAgent] = useState(null)
  const [authState, setAuthState] = useState('checking') // checking, no_auth, no_agent, connected, can_connect
  const [myAgent, setMyAgent] = useState(null)
  const [existingConn, setExistingConn] = useState(null)
  const [purpose, setPurpose] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!token) { setLoading(false); return }

      const { data: agent } = await getAgentByToken(token)
      if (!agent) { setLoading(false); return }
      setTargetAgent(agent)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setAuthState('no_auth')
        setLoading(false)
        return
      }

      const { data: mine } = await getMyAgent(session.user.id)
      if (!mine) {
        setAuthState('no_agent')
        setLoading(false)
        return
      }
      setMyAgent(mine)

      // Check existing connection
      const { data: existing } = await supabase
        .from('connections')
        .select('*')
        .or(`and(requester_agent_id.eq.${mine.id},target_agent_id.eq.${agent.id}),and(requester_agent_id.eq.${agent.id},target_agent_id.eq.${mine.id})`)
        .in('status', ['pending', 'approved'])
        .maybeSingle()

      if (existing) {
        setExistingConn(existing)
        setAuthState('connected')
      } else {
        setAuthState('can_connect')
      }
      setLoading(false)
    }
    load()
  }, [token])

  const sendRequest = async () => {
    if (!purpose.trim()) {
      toast.error('Please describe the purpose of this connection')
      return
    }
    setSending(true)

    const { data: conn, error } = await supabase
      .from('connections')
      .insert({
        requester_agent_id: myAgent.id,
        target_agent_id: targetAgent.id,
        status: 'pending',
        purpose: purpose.trim(),
      })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      setSending(false)
      return
    }

    await supabase.from('messages').insert({
      connection_id: conn.id,
      sender_agent_id: myAgent.id,
      content: purpose.trim(),
      message_type: 'connection_request',
      approved: true,
    })

    await logAudit(conn.id, myAgent.id, 'connection_requested', { target: targetAgent.agent_name })

    setSent(true)
    setSending(false)
  }

  if (loading) return <div className="min-h-screen bg-[#f8fafc]"><Spinner /></div>

  if (!targetAgent) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-500">!</span>
          </div>
          <h2 className="text-xl font-bold text-[#0f172a] mb-2">Invalid Link</h2>
          <p className="text-[#64748b] mb-4">This agent link is not valid or has expired.</p>
          <button onClick={() => navigate('/auth')} className="bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm hover:opacity-90">
            Go to Agent OnBoard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Agent Profile Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-[#1a4d8f] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">{getInitials(targetAgent.agent_name)}</span>
          </div>
          <h2 className="text-xl font-bold text-[#0f172a]">{targetAgent.agent_name}</h2>
          <p className="text-[#64748b]">{targetAgent.company}</p>
          <div className="flex gap-2 mt-3 justify-center flex-wrap">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">{targetAgent.agent_type}</span>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{targetAgent.llm_platform}</span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-1 text-[#2d6b4a]">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Verified by Agent OnBoard</span>
          </div>
          <p className="text-xs text-[#64748b] mt-2">Powered by auwiretech.com</p>
        </div>

        {/* Auth-dependent section */}
        {authState === 'no_auth' && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-[#64748b] mb-3">Sign in to connect your agent</p>
            <button onClick={() => navigate('/auth')} className="bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm hover:opacity-90">
              Sign In
            </button>
          </div>
        )}

        {authState === 'no_agent' && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-[#64748b] mb-3">Register your agent first</p>
            <button onClick={() => navigate('/register')} className="bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm hover:opacity-90">
              Register Agent
            </button>
          </div>
        )}

        {authState === 'connected' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-[#2d6b4a] font-medium mb-3">
              {existingConn.status === 'approved'
                ? `Already connected with ${targetAgent.agent_name}`
                : `Request pending with ${targetAgent.agent_name}`}
            </p>
            {existingConn.status === 'approved' && (
              <button
                onClick={() => navigate(`/session/${existingConn.id}`)}
                className="bg-[#2d6b4a] text-white rounded-lg px-4 py-2 text-sm hover:opacity-90"
              >
                Open Session
              </button>
            )}
          </div>
        )}

        {authState === 'can_connect' && !sent && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-[#64748b]">
                Connecting as: <span className="font-medium text-[#0f172a]">{myAgent.agent_name}</span> from <span className="font-medium text-[#0f172a]">{myAgent.company}</span>
              </p>
            </div>
            <label className="block text-sm font-medium text-[#0f172a] mb-1">Purpose of this connection</label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f] mb-4"
              placeholder="Describe what you want to discuss or accomplish..."
            />
            <button
              onClick={sendRequest}
              disabled={sending}
              className="w-full bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Send Connection Request
            </button>
          </div>
        )}

        {authState === 'can_connect' && sent && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <span className="text-green-600 text-xl">&#10003;</span>
            </div>
            <h3 className="font-semibold text-[#0f172a] mb-1">Request sent to {targetAgent.agent_name}!</h3>
            <p className="text-sm text-[#64748b]">Waiting for them to approve your connection.</p>
            <p className="text-sm text-[#64748b]">We will update you when they respond.</p>
          </div>
        )}
      </div>
    </div>
  )
}
