import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getMyAgents, logAudit, sendNotification, timeAgo } from '../lib/supabase'
import Layout from '../components/Layout'
import QRDisplay from '../components/QRDisplay'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Clock, Users, Zap, Shield, Plus, Bot, XCircle } from 'lucide-react'

function DashboardSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="flex gap-2">
              <div className="h-6 bg-gray-200 rounded-full w-24" />
              <div className="h-6 bg-gray-200 rounded-full w-20" />
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-40 mx-auto mb-4" />
            <div className="w-[200px] h-[200px] bg-gray-200 rounded mx-auto" />
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-pulse">
                <div className="w-5 h-5 bg-gray-200 rounded mx-auto mb-2" />
                <div className="h-8 bg-gray-200 rounded w-12 mx-auto mb-1" />
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto" />
              </div>
            ))}
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
              <div className="h-16 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [agents, setAgents] = useState([])
  const [agent, setAgent] = useState(null)
  const [pending, setPending] = useState([])
  const [active, setActive] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [unapprovedCounts, setUnapprovedCounts] = useState({})
  const navigate = useNavigate()

  const loadData = async (selectedAgent) => {
    const ag = selectedAgent || agent
    if (!ag) return

    // Pending connections targeting me
    const { data: pend } = await supabase
      .from('connections')
      .select('*, requester:agents!connections_requester_agent_id_fkey(*)')
      .eq('target_agent_id', ag.id)
      .eq('status', 'pending')
    setPending(pend || [])

    // Active connections where I'm involved
    const { data: act } = await supabase
      .from('connections')
      .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
      .or(`requester_agent_id.eq.${ag.id},target_agent_id.eq.${ag.id}`)
      .eq('status', 'approved')
    setActive(act || [])

    // Get unapproved message counts for active connections
    if (act && act.length > 0) {
      const counts = {}
      for (const conn of act) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('connection_id', conn.id)
          .neq('sender_agent_id', ag.id)
          .eq('approved', false)
        counts[conn.id] = count || 0
      }
      setUnapprovedCounts(counts)
    }
  }

  const loadAgents = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: allAgents } = await getMyAgents(user.id)
    if (!allAgents || allAgents.length === 0) {
      navigate('/register')
      return
    }
    setAgents(allAgents)

    // Restore last selected agent from localStorage or use first
    const lastId = localStorage.getItem('active_agent_id')
    const selected = allAgents.find(a => a.id === lastId) || allAgents[0]
    setAgent(selected)
    localStorage.setItem('active_agent_id', selected.id)

    await loadData(selected)
    setLoading(false)
  }

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (!agent) return
    const channel = supabase
      .channel('dashboard-connections')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new.target_agent_id === agent.id && payload.new.status === 'pending') {
          toast.success('New connection request!')
        }
        loadData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [agent?.id])

  const switchAgent = async (ag) => {
    setAgent(ag)
    localStorage.setItem('active_agent_id', ag.id)
    setLoading(true)
    await loadData(ag)
    setLoading(false)
  }

  const approve = async (conn) => {
    setActionLoading(conn.id)
    await supabase.from('connections').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', conn.id)
    await logAudit(conn.id, agent.id, 'connection_approved')
    toast.success('Connection approved!')

    // Send notification to requester
    if (conn.requester?.user_email) {
      sendNotification('connection_approved', conn.requester.user_email, agent.agent_name, agent.company, conn.id)
    }

    await loadData()
    setActionLoading(null)
  }

  const decline = async (conn) => {
    setActionLoading(conn.id)
    await supabase.from('connections').update({ status: 'declined' }).eq('id', conn.id)
    await logAudit(conn.id, agent.id, 'connection_declined')
    toast.success('Connection declined')
    await loadData()
    setActionLoading(null)
  }

  const revokeConnection = async (conn) => {
    setActionLoading(conn.id)
    await supabase.from('connections').update({ status: 'revoked' }).eq('id', conn.id)
    await logAudit(conn.id, agent.id, 'connection_revoked')
    toast.success('Connection revoked')
    setRevokeTarget(null)
    await loadData()
    setActionLoading(null)
  }

  const toggleAutoRespond = (agentId) => {
    const key = `llm_auto_${agentId}`
    const current = localStorage.getItem(key) === 'true'
    localStorage.setItem(key, (!current).toString())
    // Force re-render
    setAgent({ ...agent })
    toast.success(current ? 'Auto-respond disabled' : 'Auto-respond enabled')
  }

  if (loading) {
    return (
      <Layout activeAgentName={agent?.agent_name}>
        <DashboardSkeleton />
      </Layout>
    )
  }

  const otherAgent = (conn) => conn.requester_agent_id === agent.id ? conn.target : conn.requester
  const totalConnections = pending.length + active.length
  const autoRespond = localStorage.getItem(`llm_auto_${agent?.id}`) === 'true'

  return (
    <Layout activeAgentName={agent?.agent_name}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Agent Switcher */}
        {agents.length > 1 && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-[#64748b] mr-1">Your Agents:</span>
              {agents.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => switchAgent(ag)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    ag.id === agent.id
                      ? 'bg-[#1a4d8f] text-white'
                      : 'bg-gray-100 text-[#64748b] hover:bg-gray-200'
                  }`}
                >
                  {ag.agent_name}
                </button>
              ))}
              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-gray-300 text-[#64748b] hover:bg-gray-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Agent
              </button>
            </div>
          </div>
        )}

        {agents.length === 1 && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => navigate('/register')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-[#64748b] hover:bg-gray-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Agent
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-6">
            {/* Agent Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#0f172a]">{agent.agent_name}</h2>
              <p className="text-[#64748b] text-sm">{agent.company}</p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">{agent.agent_type}</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{agent.llm_platform}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-[#2d6b4a]">
                  <div className="w-2 h-2 rounded-full bg-[#2d6b4a]" /> Active
                </span>
              </div>

              {/* Auto-Respond Toggle */}
              {agent.llm_api_key && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => toggleAutoRespond(agent.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium w-full justify-center transition-colors ${
                      autoRespond
                        ? 'bg-[#2d6b4a] text-white'
                        : 'border border-gray-200 text-[#64748b] hover:bg-gray-50'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    Auto-Respond {autoRespond ? 'ON' : 'OFF'}
                  </button>
                  <p className="text-xs text-[#64748b] mt-1 text-center">
                    {autoRespond ? 'Agent will auto-reply to new messages' : 'Enable automatic AI responses'}
                  </p>
                </div>
              )}
            </div>

            {/* QR Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center">
              <h3 className="font-semibold text-[#0f172a] mb-1">Your Agent QR Code</h3>
              <p className="text-sm text-[#64748b] mb-4">Share this so other agents can connect</p>
              <QRDisplay agent={agent} />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
                <Clock className="w-5 h-5 mx-auto text-[#b45309] mb-1" />
                <p className="text-2xl font-bold text-[#0f172a]">{pending.length}</p>
                <p className="text-xs text-[#64748b]">Pending</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
                <Zap className="w-5 h-5 mx-auto text-[#2d6b4a] mb-1" />
                <p className="text-2xl font-bold text-[#0f172a]">{active.length}</p>
                <p className="text-xs text-[#64748b]">Active</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
                <Users className="w-5 h-5 mx-auto text-[#1a4d8f] mb-1" />
                <p className="text-2xl font-bold text-[#0f172a]">{totalConnections}</p>
                <p className="text-xs text-[#64748b]">Total</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
                <Shield className="w-5 h-5 mx-auto text-[#2d6b4a] mb-1" />
                <p className="text-2xl font-bold text-[#2d6b4a]">Online</p>
                <p className="text-xs text-[#64748b]">Status</p>
              </div>
            </div>

            {/* Pending Requests */}
            <div>
              <h3 className="text-lg font-semibold text-[#0f172a] mb-3">Pending Requests</h3>
              {pending.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center">
                  <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-[#64748b] font-medium">No pending requests</p>
                  <p className="text-sm text-[#64748b]">Share your QR code to receive connections</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((conn) => (
                    <div key={conn.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-[#0f172a]">{conn.requester?.agent_name}</p>
                          <p className="text-sm text-[#64748b]">{conn.requester?.company}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">{conn.requester?.agent_type}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{conn.requester?.llm_platform}</span>
                          </div>
                          {conn.purpose && <p className="text-sm text-[#0f172a] mt-2 italic">"{conn.purpose}"</p>}
                          <p className="text-xs text-[#64748b] mt-1">{timeAgo(conn.created_at)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(conn)}
                            disabled={actionLoading === conn.id}
                            className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decline(conn)}
                            disabled={actionLoading === conn.id}
                            className="bg-red-100 text-red-600 rounded-lg px-4 py-2 text-sm hover:bg-red-200 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Connections */}
            <div>
              <h3 className="text-lg font-semibold text-[#0f172a] mb-3">Active Connections</h3>
              {active.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center">
                  <Users className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-[#64748b] font-medium">No active connections yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {active.map((conn) => {
                    const other = otherAgent(conn)
                    const msgCount = unapprovedCounts[conn.id] || 0
                    return (
                      <div key={conn.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#0f172a]">{other?.agent_name}</p>
                              {msgCount > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#b45309] text-white text-xs font-bold">
                                  {msgCount}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#64748b]">{other?.company}</p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">{other?.agent_type}</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{other?.llm_platform}</span>
                            </div>
                            <p className="text-xs text-[#64748b] mt-1">Connected {timeAgo(conn.approved_at || conn.created_at)}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => navigate(`/session/${conn.id}`)}
                              className="bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm hover:opacity-90"
                            >
                              Open Session
                            </button>
                            <button
                              onClick={() => navigate(`/audit/${conn.id}`)}
                              className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                            >
                              View Audit
                            </button>
                            <button
                              onClick={() => setRevokeTarget(conn)}
                              className="border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-[#0f172a]">Revoke Connection</h3>
                <p className="text-sm text-[#64748b]">
                  This will end your connection with{' '}
                  <span className="font-medium text-[#0f172a]">
                    {otherAgent(revokeTarget)?.agent_name}
                  </span>
                </p>
              </div>
            </div>
            <p className="text-sm text-[#64748b] mb-4">
              This action cannot be undone. The other agent will no longer be able to send messages in this session.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRevokeTarget(null)}
                className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeConnection(revokeTarget)}
                disabled={actionLoading === revokeTarget.id}
                className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === revokeTarget.id ? 'Revoking...' : 'Revoke Connection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
