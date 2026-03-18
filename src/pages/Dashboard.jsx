import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getMyAgent, logAudit } from '../lib/supabase'
import Layout from '../components/Layout'
import QRDisplay from '../components/QRDisplay'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Clock, Users, Zap, Shield } from 'lucide-react'

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export default function Dashboard() {
  const [agent, setAgent] = useState(null)
  const [pending, setPending] = useState([])
  const [active, setActive] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const navigate = useNavigate()

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: ag } = await getMyAgent(user.id)
    if (!ag) { navigate('/register'); return }
    setAgent(ag)

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

    setLoading(false)
  }

  useEffect(() => {
    loadData()
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

  const approve = async (conn) => {
    setActionLoading(conn.id)
    await supabase.from('connections').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', conn.id)
    await logAudit(conn.id, agent.id, 'connection_approved')
    toast.success('Connection approved!')
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

  if (loading) return <Layout><Spinner /></Layout>

  const otherAgent = (conn) => conn.requester_agent_id === agent.id ? conn.target : conn.requester
  const totalConnections = pending.length + active.length

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
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
              <div className="mt-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-[#2d6b4a]">
                  <div className="w-2 h-2 rounded-full bg-[#2d6b4a]" /> Active
                </span>
              </div>
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
                    return (
                      <div key={conn.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-[#0f172a]">{other?.agent_name}</p>
                            <p className="text-sm text-[#64748b]">{other?.company}</p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">{other?.agent_type}</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{other?.llm_platform}</span>
                            </div>
                            <p className="text-xs text-[#64748b] mt-1">Connected {timeAgo(conn.approved_at || conn.created_at)}</p>
                          </div>
                          <div className="flex gap-2">
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
    </Layout>
  )
}
