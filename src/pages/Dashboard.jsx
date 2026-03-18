import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getMyAgents, logAudit, sendNotification, timeAgo } from '../lib/supabase'
import Layout from '../components/Layout'
import QRDisplay from '../components/QRDisplay'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Clock, Users, Zap, Shield, Plus, Bot, XCircle, FileText, CheckCircle, Ban } from 'lucide-react'
import DocumentManager from '../components/DocumentManager'

function DashboardSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
            <div className="h-6 bg-[#f5f5f7] rounded-xl w-2/3 mb-3" />
            <div className="h-4 bg-[#f5f5f7] rounded-xl w-1/2 mb-4" />
            <div className="flex gap-2">
              <div className="h-7 bg-[#f5f5f7] rounded-full w-24" />
              <div className="h-7 bg-[#f5f5f7] rounded-full w-20" />
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
            <div className="h-5 bg-[#f5f5f7] rounded-xl w-40 mx-auto mb-4" />
            <div className="w-[200px] h-[200px] bg-[#f5f5f7] rounded-2xl mx-auto" />
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
                <div className="w-5 h-5 bg-[#f5f5f7] rounded-full mx-auto mb-3" />
                <div className="h-8 bg-[#f5f5f7] rounded-xl w-12 mx-auto mb-2" />
                <div className="h-3 bg-[#f5f5f7] rounded-xl w-16 mx-auto" />
              </div>
            ))}
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
              <div className="h-5 bg-[#f5f5f7] rounded-xl w-40 mb-4" />
              <div className="h-16 bg-[#f5f5f7] rounded-xl" />
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
  const [closedConnections, setClosedConnections] = useState([])
  const [reportModal, setReportModal] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportContent, setReportContent] = useState(null)
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

    // Completed + Revoked connections
    const { data: closed } = await supabase
      .from('connections')
      .select('*, requester:agents!connections_requester_agent_id_fkey(*), target:agents!connections_target_agent_id_fkey(*)')
      .or(`requester_agent_id.eq.${ag.id},target_agent_id.eq.${ag.id}`)
      .in('status', ['completed', 'revoked'])
      .order('created_at', { ascending: false })
    setClosedConnections(closed || [])

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

  const generateReport = async (conn) => {
    setReportModal(conn)
    setReportLoading(true)
    setReportContent(null)

    const other = otherAgent(conn)

    // Load all messages for this connection
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: true })

    // Load audit entries
    const { data: audits } = await supabase
      .from('audit_log')
      .select('*')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: true })

    if (!agent.llm_api_key || !msgs || msgs.length === 0) {
      setReportContent({
        summary: 'No conversation data available for this connection.',
        outcome: conn.status === 'completed' ? 'Completed' : 'Revoked',
        messages: msgs?.length || 0,
        events: audits?.length || 0,
      })
      setReportLoading(false)
      return
    }

    // Ask LLM to generate a report
    const convoText = msgs.map(m => {
      const sender = m.sender_agent_id === agent.id ? agent.agent_name : other?.agent_name
      return `${sender}: ${m.content}`
    }).join('\n\n')

    try {
      const res = await fetch('http://localhost:3001/api/agent-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: agent.llm_api_key,
          platform: agent.llm_platform,
          system_prompt: `You are a business analyst generating a connection report for Agent OnBoard by Auwire Technologies. Analyze the conversation and provide a structured report.`,
          messages: [{
            role: 'user',
            content: `Generate a connection report for this agent-to-agent session.

CONNECTION DETAILS:
- Agent 1: ${agent.agent_name} (${agent.company}) — ${agent.agent_type}
- Agent 2: ${other?.agent_name} (${other?.company}) — ${other?.agent_type}
- Status: ${conn.status}
- Started: ${new Date(conn.created_at).toLocaleString()}
- Purpose: ${conn.purpose || 'Not specified'}
- Total messages: ${msgs.length}
- Total audit events: ${audits?.length || 0}

FULL CONVERSATION:
${convoText}

Provide the report in this exact format:
SUMMARY: (2-3 sentences about what happened)
OUTCOME: (what was the result — agreement, referral, no match, etc.)
KEY TOPICS: (comma-separated list of topics discussed)
ACTION ITEMS: (any follow-ups or next steps mentioned)
RECOMMENDATION: (1 sentence recommendation for future connections)`
          }]
        })
      })

      if (!res.ok) throw new Error('Report generation failed')
      const { response } = await res.json()

      // Parse the LLM response into sections
      const sections = {}
      const lines = response.split('\n')
      let currentKey = null
      for (const line of lines) {
        const match = line.match(/^(SUMMARY|OUTCOME|KEY TOPICS|ACTION ITEMS|RECOMMENDATION):\s*(.*)/)
        if (match) {
          currentKey = match[1]
          sections[currentKey] = match[2]
        } else if (currentKey && line.trim()) {
          sections[currentKey] = (sections[currentKey] || '') + ' ' + line.trim()
        }
      }

      setReportContent({
        summary: sections['SUMMARY'] || response,
        outcome: sections['OUTCOME'] || (conn.status === 'completed' ? 'Completed' : 'Revoked'),
        keyTopics: sections['KEY TOPICS'] || '',
        actionItems: sections['ACTION ITEMS'] || 'None specified',
        recommendation: sections['RECOMMENDATION'] || '',
        messages: msgs.length,
        events: audits?.length || 0,
        raw: response,
      })
    } catch (err) {
      setReportContent({
        summary: 'Could not generate AI report. Connection data is still available in the audit trail.',
        outcome: conn.status === 'completed' ? 'Completed' : 'Revoked',
        messages: msgs?.length || 0,
        events: audits?.length || 0,
      })
    }

    setReportLoading(false)
  }

  const downloadReport = () => {
    if (!reportContent || !reportModal) return
    const other = otherAgent(reportModal)
    const report = {
      connection_id: reportModal.id,
      status: reportModal.status,
      agent_1: { name: agent.agent_name, company: agent.company, type: agent.agent_type },
      agent_2: { name: other?.agent_name, company: other?.company, type: other?.agent_type },
      created_at: reportModal.created_at,
      purpose: reportModal.purpose,
      ...reportContent,
      generated_at: new Date().toISOString(),
      generated_by: 'Agent OnBoard by Auwire Technologies',
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `report-${reportModal.id.slice(0, 8)}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Report downloaded')
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Agent Switcher */}
        {agents.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-[#86868b] mr-1">Your Agents:</span>
              {agents.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => switchAgent(ag)}
                  className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    ag.id === agent.id
                      ? 'bg-[#0071e3] text-white'
                      : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                  }`}
                >
                  {ag.agent_name}
                </button>
              ))}
              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-dashed border-black/10 text-[#6e6e73] hover:bg-[#f5f5f7] transition-all duration-200"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed] transition-all duration-200"
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
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1d1d1f] tracking-tight">{agent.agent_name}</h2>
              <p className="text-[#6e6e73] text-sm mt-1">{agent.company}</p>
              <div className="flex gap-2 mt-4 flex-wrap">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">{agent.agent_type}</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">{agent.llm_platform}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#34c759]/10 text-[#34c759]">
                  <div className="w-2 h-2 rounded-full bg-[#34c759]" /> Active
                </span>
              </div>

              {/* Auto-Respond Toggle */}
              {agent.llm_api_key && (
                <div className="mt-5 pt-5 border-t border-black/5">
                  <button
                    onClick={() => toggleAutoRespond(agent.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium w-full justify-center transition-all duration-200 ${
                      autoRespond
                        ? 'bg-[#34c759] text-white'
                        : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    Auto-Respond {autoRespond ? 'ON' : 'OFF'}
                  </button>
                  <p className="text-xs text-[#86868b] mt-2 text-center">
                    {autoRespond ? 'Agent will auto-reply to new messages' : 'Enable automatic AI responses'}
                  </p>
                </div>
              )}
            </div>

            {/* QR Section */}
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <h3 className="font-semibold text-[#1d1d1f] mb-1">Your Agent QR Code</h3>
              <p className="text-sm text-[#86868b] mb-4">Share this so other agents can connect</p>
              <QRDisplay agent={agent} />
            </div>

            {/* Knowledge Base */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-[#1d1d1f] mb-1">Knowledge Base</h3>
              <p className="text-sm text-[#86868b] mb-4">Upload documents for your agent's learning</p>
              <DocumentManager agent={agent} />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Clock className="w-5 h-5 mx-auto text-[#ff9500] mb-2" />
                <p className="text-3xl font-bold text-[#1d1d1f] tracking-tight">{pending.length}</p>
                <p className="text-xs text-[#86868b] mt-1">Pending</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Zap className="w-5 h-5 mx-auto text-[#34c759] mb-2" />
                <p className="text-3xl font-bold text-[#1d1d1f] tracking-tight">{active.length}</p>
                <p className="text-xs text-[#86868b] mt-1">Active</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Users className="w-5 h-5 mx-auto text-[#0071e3] mb-2" />
                <p className="text-3xl font-bold text-[#1d1d1f] tracking-tight">{totalConnections}</p>
                <p className="text-xs text-[#86868b] mt-1">Total</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Shield className="w-5 h-5 mx-auto text-[#34c759] mb-2" />
                <p className="text-2xl font-bold text-[#34c759] tracking-tight">Online</p>
                <p className="text-xs text-[#86868b] mt-1">Status</p>
              </div>
            </div>

            {/* Pending Requests */}
            <div>
              <h3 className="text-lg font-semibold text-[#1d1d1f] tracking-tight mb-3">Pending Requests</h3>
              {pending.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 shadow-sm text-center">
                  <Clock className="w-10 h-10 mx-auto text-[#86868b]/30 mb-3" />
                  <p className="text-[#6e6e73] font-medium">No pending requests</p>
                  <p className="text-sm text-[#86868b]">Share your QR code to receive connections</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((conn) => (
                    <div key={conn.id} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-[#1d1d1f]">{conn.requester?.agent_name}</p>
                          <p className="text-sm text-[#6e6e73]">{conn.requester?.company}</p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">{conn.requester?.agent_type}</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">{conn.requester?.llm_platform}</span>
                          </div>
                          {conn.purpose && <p className="text-sm text-[#1d1d1f] mt-2 italic">"{conn.purpose}"</p>}
                          <p className="text-xs text-[#86868b] mt-1">{timeAgo(conn.created_at)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(conn)}
                            disabled={actionLoading === conn.id}
                            className="bg-[#34c759] hover:bg-[#30b350] text-white rounded-full px-5 py-2 text-sm font-medium disabled:opacity-50 transition-all duration-200"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decline(conn)}
                            disabled={actionLoading === conn.id}
                            className="bg-[#ff3b30]/10 text-[#ff3b30] rounded-full px-5 py-2 text-sm font-medium hover:bg-[#ff3b30]/20 disabled:opacity-50 transition-all duration-200"
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
              <h3 className="text-lg font-semibold text-[#1d1d1f] tracking-tight mb-3">Active Connections</h3>
              {active.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 shadow-sm text-center">
                  <Users className="w-10 h-10 mx-auto text-[#86868b]/30 mb-3" />
                  <p className="text-[#6e6e73] font-medium">No active connections yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {active.map((conn) => {
                    const other = otherAgent(conn)
                    const msgCount = unapprovedCounts[conn.id] || 0
                    return (
                      <div key={conn.id} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#1d1d1f]">{other?.agent_name}</p>
                              {msgCount > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#ff3b30] text-white text-xs font-bold">
                                  {msgCount}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#6e6e73]">{other?.company}</p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">{other?.agent_type}</span>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">{other?.llm_platform}</span>
                            </div>
                            <p className="text-xs text-[#86868b] mt-1">Connected {timeAgo(conn.approved_at || conn.created_at)}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => navigate(`/session/${conn.id}`)}
                              className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              Open Session
                            </button>
                            <button
                              onClick={() => navigate(`/audit/${conn.id}`)}
                              className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              View Audit
                            </button>
                            <button
                              onClick={() => setRevokeTarget(conn)}
                              className="text-[#ff3b30] hover:bg-[#ff3b30]/5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200"
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
            {/* Closed Connections (Completed + Revoked) */}
            {closedConnections.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-[#1d1d1f] tracking-tight mb-3">Past Sessions</h3>
                <div className="space-y-3">
                  {closedConnections.map((conn) => {
                    const other = otherAgent(conn)
                    return (
                      <div key={conn.id} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 opacity-90">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#1d1d1f]">{other?.agent_name}</p>
                              {conn.status === 'completed' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#34c759]/10 text-[#34c759]">
                                  <CheckCircle className="w-3 h-3" /> Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ff3b30]/10 text-[#ff3b30]">
                                  <Ban className="w-3 h-3" /> Revoked
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#6e6e73]">{other?.company}</p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">{other?.agent_type}</span>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">{other?.llm_platform}</span>
                            </div>
                            {conn.purpose && <p className="text-xs text-[#86868b] mt-1 italic">"{conn.purpose}"</p>}
                            <p className="text-xs text-[#86868b] mt-1">{timeAgo(conn.created_at)}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => generateReport(conn)}
                              className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Report
                            </button>
                            <button
                              onClick={() => navigate(`/audit/${conn.id}`)}
                              className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              Audit
                            </button>
                            <button
                              onClick={() => navigate(`/session/${conn.id}`)}
                              className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0071e3]/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#0071e3]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1d1d1f]">Connection Report</h3>
                  <p className="text-xs text-[#86868b]">{reportModal.id.slice(0, 8)} — {otherAgent(reportModal)?.agent_name}</p>
                </div>
              </div>
              <button
                onClick={() => { setReportModal(null); setReportContent(null) }}
                className="text-[#86868b] hover:text-[#1d1d1f] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {reportLoading ? (
              <div className="py-12 text-center">
                <div className="w-8 h-8 border-[3px] border-[#0071e3]/20 border-t-[#0071e3] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#6e6e73] text-sm">Generating report...</p>
              </div>
            ) : reportContent ? (
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#f5f5f7] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#1d1d1f]">{reportContent.messages}</p>
                    <p className="text-xs text-[#86868b]">Messages</p>
                  </div>
                  <div className="bg-[#f5f5f7] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#1d1d1f]">{reportContent.events}</p>
                    <p className="text-xs text-[#86868b]">Events</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${reportModal.status === 'completed' ? 'bg-[#34c759]/10' : 'bg-[#ff3b30]/10'}`}>
                    <p className={`text-lg font-bold capitalize ${reportModal.status === 'completed' ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{reportModal.status}</p>
                    <p className="text-xs text-[#86868b]">Status</p>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-[#f5f5f7] rounded-xl p-4">
                  <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-1">Summary</p>
                  <p className="text-sm text-[#1d1d1f]">{reportContent.summary}</p>
                </div>

                {/* Outcome */}
                {reportContent.outcome && (
                  <div className="bg-[#f5f5f7] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-1">Outcome</p>
                    <p className="text-sm text-[#1d1d1f]">{reportContent.outcome}</p>
                  </div>
                )}

                {/* Key Topics */}
                {reportContent.keyTopics && (
                  <div className="bg-[#f5f5f7] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-2">Key Topics</p>
                    <div className="flex flex-wrap gap-2">
                      {reportContent.keyTopics.split(',').map((topic, i) => (
                        <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white text-[#1d1d1f]">
                          {topic.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Items */}
                {reportContent.actionItems && (
                  <div className="bg-[#f5f5f7] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-1">Action Items</p>
                    <p className="text-sm text-[#1d1d1f]">{reportContent.actionItems}</p>
                  </div>
                )}

                {/* Recommendation */}
                {reportContent.recommendation && (
                  <div className="bg-[#0071e3]/5 rounded-xl p-4">
                    <p className="text-xs font-medium text-[#0071e3] uppercase tracking-wider mb-1">Recommendation</p>
                    <p className="text-sm text-[#1d1d1f]">{reportContent.recommendation}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={downloadReport}
                    className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" />
                    Download Report
                  </button>
                  <button
                    onClick={() => navigate(`/audit/${reportModal.id}`)}
                    className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200"
                  >
                    View Full Audit
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
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
                  <span className="font-medium text-[#1d1d1f]">
                    {otherAgent(revokeTarget)?.agent_name}
                  </span>
                </p>
              </div>
            </div>
            <p className="text-sm text-[#6e6e73] mb-6">
              This action cannot be undone. The other agent will no longer be able to send messages in this session.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRevokeTarget(null)}
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeConnection(revokeTarget)}
                disabled={actionLoading === revokeTarget.id}
                className="bg-[#ff3b30] hover:bg-[#ff453a] text-white rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-all duration-200"
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
