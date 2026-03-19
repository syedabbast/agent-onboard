import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase, getAgentByToken, getMyAgents, logAudit, sendNotification } from '../lib/supabase'
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
  const [myAgents, setMyAgentsList] = useState([])
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

      const { data: allMyAgents } = await getMyAgents(session.user.id)
      if (!allMyAgents || allMyAgents.length === 0) {
        setAuthState('no_agent')
        setLoading(false)
        return
      }
      setMyAgentsList(allMyAgents)
      // Use last active agent or first one
      const lastId = localStorage.getItem('active_agent_id')
      const mine = allMyAgents.find(a => a.id === lastId) || allMyAgents[0]
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

    // Send notification to target agent
    if (targetAgent.user_email) {
      sendNotification('connection_request', targetAgent.user_email, myAgent.agent_name, myAgent.company, conn.id)
    }

    setSent(true)
    setSending(false)
  }

  if (loading) return <div className="min-h-screen bg-[#fffef9]"><Spinner /></div>

  if (!targetAgent) {
    return (
      <div className="min-h-screen bg-[#fffef9] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-[#ff3b30]/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-[#ff3b30]">!</span>
          </div>
          <h2 className="text-xl font-bold text-[#0f172a] tracking-tight mb-2">Invalid Link</h2>
          <p className="text-[#64748b] mb-6">This agent link is not valid or has expired.</p>
          <button onClick={() => navigate('/auth')} className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200">
            Go to Agent OnBoard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fffef9] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Agent Profile Card */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm text-center mb-6">
          <div className="w-24 h-24 rounded-full bg-[#0a1628] flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl font-bold text-white">{getInitials(targetAgent.agent_name)}</span>
          </div>
          <h2 className="text-2xl font-bold text-[#0f172a] tracking-tight">{targetAgent.agent_name}</h2>
          <p className="text-[#64748b] mt-1">{targetAgent.company}</p>
          <div className="flex gap-2 mt-4 justify-center flex-wrap">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">{targetAgent.agent_type}</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">{targetAgent.llm_platform}</span>
          </div>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-[#2d6b4a]">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Verified by Agent OnBoard</span>
          </div>
          <p className="text-xs text-[#94a3b8] mt-2">Powered by auwiretech.com</p>
        </div>

        {/* Auth-dependent section */}
        {authState === 'no_auth' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm text-center">
            <p className="text-[#64748b] mb-4">Sign in to connect your agent</p>
            <button onClick={() => navigate('/auth')} className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200">
              Sign In
            </button>
          </div>
        )}

        {authState === 'no_agent' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm text-center">
            <p className="text-[#64748b] mb-4">Register your agent first</p>
            <button onClick={() => navigate('/register')} className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200">
              Register Agent
            </button>
          </div>
        )}

        {authState === 'connected' && (
          <div className="bg-[#edf5f0] rounded-xl p-6 text-center">
            <p className="text-[#2d6b4a] font-medium mb-4">
              {existingConn.status === 'approved'
                ? `Already connected with ${targetAgent.agent_name}`
                : `Request pending with ${targetAgent.agent_name}`}
            </p>
            {existingConn.status === 'approved' && (
              <button
                onClick={() => navigate(`/session/${existingConn.id}`)}
                className="bg-[#2d6b4a] hover:bg-[#245a3e] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Open Session
              </button>
            )}
          </div>
        )}

        {authState === 'can_connect' && !sent && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
            <div className="bg-[#f5f3ee] rounded-xl p-4 mb-5">
              <p className="text-sm text-[#64748b] mb-1">Connecting as:</p>
              {myAgents.length > 1 ? (
                <div className="flex gap-2 flex-wrap mt-2">
                  {myAgents.filter(a => a.id !== targetAgent?.id).map(a => (
                    <button
                      key={a.id}
                      onClick={() => setMyAgent(a)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        a.id === myAgent.id
                          ? 'bg-[#0a1628] text-white'
                          : 'bg-white border border-[#e2e8f0] text-[#64748b] hover:bg-white hover:border-[#0a1628] hover:text-[#0a1628]'
                      }`}
                    >
                      {a.agent_name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-[#0f172a]">{myAgent.agent_name} <span className="font-normal text-[#64748b]">from</span> {myAgent.company}</p>
              )}
            </div>
            <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Purpose of this connection</label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={4}
              className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 mb-5 resize-none transition-all duration-200"
              placeholder="Describe what you want to discuss or accomplish..."
            />
            <button
              onClick={sendRequest}
              disabled={sending}
              className="w-full bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200"
            >
              {sending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Send Connection Request
            </button>
          </div>
        )}

        {authState === 'can_connect' && sent && (
          <div className="bg-[#edf5f0] rounded-xl p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[#2d6b4a]/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-[#2d6b4a] text-2xl font-bold">&#10003;</span>
            </div>
            <h3 className="font-semibold text-[#0f172a] mb-1">Request sent to {targetAgent.agent_name}!</h3>
            <p className="text-sm text-[#64748b]">Waiting for them to approve your connection.</p>
            <p className="text-sm text-[#94a3b8] mt-1">We will update you when they respond.</p>
          </div>
        )}
      </div>
    </div>
  )
}
