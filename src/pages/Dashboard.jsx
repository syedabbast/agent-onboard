import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getMyAgents, logAudit, sendNotification, timeAgo } from '../lib/supabase'
import Layout from '../components/Layout'
import QRDisplay from '../components/QRDisplay'
import Spinner from '../components/Spinner'
import toast from 'react-hot-toast'
import { Clock, Users, Zap, Shield, Plus, Bot, XCircle, FileText, CheckCircle, Ban, Pencil, ClipboardList, Download, AlertTriangle, ArrowRight, Calendar } from 'lucide-react'
import DocumentManager from '../components/DocumentManager'
import ApiKeySettings from '../components/ApiKeySettings'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function DashboardSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
            <div className="h-6 bg-[#f5f3ee] rounded-xl w-2/3 mb-3" />
            <div className="h-4 bg-[#f5f3ee] rounded-xl w-1/2 mb-4" />
            <div className="flex gap-2">
              <div className="h-7 bg-[#f5f3ee] rounded-full w-24" />
              <div className="h-7 bg-[#f5f3ee] rounded-full w-20" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
            <div className="h-5 bg-[#f5f3ee] rounded-xl w-40 mx-auto mb-4" />
            <div className="w-[200px] h-[200px] bg-[#f5f3ee] rounded-xl mx-auto" />
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm animate-pulse">
                <div className="w-5 h-5 bg-[#f5f3ee] rounded-full mx-auto mb-3" />
                <div className="h-8 bg-[#f5f3ee] rounded-xl w-12 mx-auto mb-2" />
                <div className="h-3 bg-[#f5f3ee] rounded-xl w-16 mx-auto" />
              </div>
            ))}
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
              <div className="h-5 bg-[#f5f3ee] rounded-xl w-40 mb-4" />
              <div className="h-16 bg-[#f5f3ee] rounded-xl" />
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
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [workflowModal, setWorkflowModal] = useState(null)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowData, setWorkflowData] = useState(null)
  const [workflowCache, setWorkflowCache] = useState({})
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

    // Preload workflow reports for completed connections
    if (closed && closed.length > 0) {
      const completedIds = closed.filter(c => c.status === 'completed').map(c => c.id)
      if (completedIds.length > 0) {
        const { data: reports } = await supabase
          .from('audit_log')
          .select('*')
          .in('connection_id', completedIds)
          .eq('action', 'session_report')
          .order('created_at', { ascending: false })
        if (reports) {
          const cache = {}
          for (const r of reports) {
            if (!cache[r.connection_id] && r.metadata) {
              cache[r.connection_id] = r.metadata
            }
          }
          setWorkflowCache(prev => ({ ...prev, ...cache }))
        }
      }
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

    // Kick off background conversation
    fetch(`${API_URL}/api/run-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection_id: conn.id,
        supabase_url: import.meta.env.VITE_SUPABASE_URL,
        supabase_key: import.meta.env.VITE_SUPABASE_ANON_KEY
      })
    }).catch(() => {}) // Fire and forget
    toast.success('Agents are now talking in the background!')

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
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/agent-respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: agent.llm_api_key,
          platform: agent.llm_platform,
          model: agent.llm_model,
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

  const openEditModal = () => {
    setEditForm({
      agent_name: agent.agent_name || '',
      company: agent.company || '',
      agent_type: agent.agent_type || '',
      llm_platform: agent.llm_platform || '',
      soul_md: agent.soul_md || '',
      skill_md: agent.skill_md || '',
    })
    setEditModal(true)
  }

  const saveEdit = async () => {
    setEditSaving(true)
    const { error } = await supabase
      .from('agents')
      .update({
        agent_name: editForm.agent_name,
        company: editForm.company,
        agent_type: editForm.agent_type,
        llm_platform: editForm.llm_platform,
        soul_md: editForm.soul_md || null,
        skill_md: editForm.skill_md || null,
      })
      .eq('id', agent.id)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Agent updated!')
      setEditModal(false)
      await loadAgents()
    }
    setEditSaving(false)
  }

  const loadWorkflow = async (conn) => {
    setWorkflowModal(conn)
    setWorkflowLoading(true)
    setWorkflowData(null)

    // Check cache first
    if (workflowCache[conn.id]) {
      setWorkflowData(workflowCache[conn.id])
      setWorkflowLoading(false)
      return
    }

    // Try to load from audit_log
    const { data: reports } = await supabase
      .from('audit_log')
      .select('*')
      .eq('connection_id', conn.id)
      .eq('action', 'session_report')
      .order('created_at', { ascending: false })
      .limit(1)

    if (reports && reports.length > 0 && reports[0].metadata) {
      const report = reports[0].metadata
      setWorkflowData(report)
      setWorkflowCache(prev => ({ ...prev, [conn.id]: report }))
      setWorkflowLoading(false)
      return
    }

    // No report found, try to generate one
    if (agent.llm_api_key) {
      try {
        const res = await fetch(`${API_URL}/api/generate-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_id: conn.id,
            supabase_url: import.meta.env.VITE_SUPABASE_URL,
            supabase_key: import.meta.env.VITE_SUPABASE_ANON_KEY
          })
        })
        if (res.ok) {
          const { report } = await res.json()
          if (report) {
            setWorkflowData(report)
            setWorkflowCache(prev => ({ ...prev, [conn.id]: report }))
          }
        }
      } catch {}
    }

    setWorkflowLoading(false)
  }

  const downloadWorkflow = () => {
    if (!workflowData || !workflowModal) return
    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `workflow-${workflowModal.id.slice(0, 8)}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Workflow downloaded')
  }

  const getOutcomeBadge = (outcome) => {
    if (!outcome) return null
    const o = outcome.toLowerCase()
    if (o.includes('agreement') || o.includes('partnership')) return { bg: 'bg-[#edf5f0]', text: 'text-[#2d6b4a]', label: outcome }
    if (o.includes('follow-up') || o.includes('follow_up') || o.includes('referral') || o.includes('information')) return { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', label: outcome }
    if (o.includes('no-match') || o.includes('no_match')) return { bg: 'bg-[#ff3b30]/10', text: 'text-[#ff3b30]', label: outcome }
    return { bg: 'bg-[#0ea5e9]/10', text: 'text-[#0ea5e9]', label: outcome }
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

  return (
    <Layout activeAgentName={agent?.agent_name}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Agent Switcher */}
        {agents.length > 1 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-sm mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-[#94a3b8] mr-1">Your Agents:</span>
              {agents.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => switchAgent(ag)}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    ag.id === agent.id
                      ? 'bg-[#0a1628] text-white'
                      : 'bg-[#f5f3ee] text-[#64748b] hover:bg-[#e8e5de]'
                  }`}
                >
                  {ag.agent_name}
                </button>
              ))}
              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-dashed border-[#e2e8f0] text-[#64748b] hover:bg-[#f5f3ee] transition-all duration-200"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#f5f3ee] text-[#64748b] hover:bg-[#e8e5de] transition-all duration-200"
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
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#0f172a] tracking-tight">{agent.agent_name}</h2>
              <p className="text-[#64748b] text-sm mt-1">{agent.company}</p>
              <div className="flex gap-2 mt-4 flex-wrap">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">{agent.agent_type}</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">{agent.llm_platform}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#edf5f0] text-[#2d6b4a]">
                  <div className="w-2 h-2 rounded-full bg-[#2d6b4a]" /> Active
                </span>
              </div>

              <button
                onClick={openEditModal}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Agent
              </button>
            </div>

            {/* LLM Settings */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
              <h3 className="font-semibold text-[#0f172a] mb-1">Agent LLM Settings</h3>
              <p className="text-sm text-[#94a3b8] mb-4">Your key. Your cost. Never shared.</p>
              <ApiKeySettings agent={agent} onUpdate={() => loadAgents()} />
            </div>

            {/* QR Section */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm text-center">
              <h3 className="font-semibold text-[#0f172a] mb-1">Your Agent QR Code</h3>
              <p className="text-sm text-[#94a3b8] mb-4">Share this so other agents can connect</p>
              <QRDisplay agent={agent} />
            </div>

            {/* Knowledge Base */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
              <h3 className="font-semibold text-[#0f172a] mb-1">Knowledge Base</h3>
              <p className="text-sm text-[#94a3b8] mb-4">Upload documents for your agent's learning</p>
              <DocumentManager agent={agent} />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Clock className="w-5 h-5 mx-auto text-[#f59e0b] mb-2" />
                <p className="text-3xl font-bold text-[#0a1628] tracking-tight">{pending.length}</p>
                <p className="text-xs text-[#94a3b8] mt-1">Pending</p>
              </div>
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Zap className="w-5 h-5 mx-auto text-[#2d6b4a] mb-2" />
                <p className="text-3xl font-bold text-[#0a1628] tracking-tight">{active.length}</p>
                <p className="text-xs text-[#94a3b8] mt-1">Active</p>
              </div>
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Users className="w-5 h-5 mx-auto text-[#0ea5e9] mb-2" />
                <p className="text-3xl font-bold text-[#0a1628] tracking-tight">{totalConnections}</p>
                <p className="text-xs text-[#94a3b8] mt-1">Total</p>
              </div>
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm text-center hover:shadow-md transition-shadow duration-200">
                <Shield className="w-5 h-5 mx-auto text-[#2d6b4a] mb-2" />
                <p className="text-2xl font-bold text-[#2d6b4a] tracking-tight">Online</p>
                <p className="text-xs text-[#94a3b8] mt-1">Status</p>
              </div>
            </div>

            {/* Pending Requests */}
            <div>
              <h3 className="text-lg font-serif font-semibold text-[#0f172a] tracking-tight mb-3">Pending Requests</h3>
              {pending.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center">
                  <Clock className="w-10 h-10 mx-auto text-[#94a3b8]/30 mb-3" />
                  <p className="text-[#64748b] font-medium">No pending requests</p>
                  <p className="text-sm text-[#94a3b8]">Share your QR code to receive connections</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((conn) => (
                    <div key={conn.id} className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-[#0f172a]">{conn.requester?.agent_name}</p>
                          <p className="text-sm text-[#64748b]">{conn.requester?.company}</p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">{conn.requester?.agent_type}</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">{conn.requester?.llm_platform}</span>
                          </div>
                          {conn.purpose && <p className="text-sm text-[#0f172a] mt-2 italic">"{conn.purpose}"</p>}
                          <p className="text-xs text-[#94a3b8] mt-1">{timeAgo(conn.created_at)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(conn)}
                            disabled={actionLoading === conn.id}
                            className="bg-[#2d6b4a] hover:bg-[#245a3e] text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50 transition-all duration-200"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decline(conn)}
                            disabled={actionLoading === conn.id}
                            className="bg-red-50 text-red-600 rounded-lg px-5 py-2 text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-all duration-200"
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
              <h3 className="text-lg font-serif font-semibold text-[#0f172a] tracking-tight mb-3">Active Connections</h3>
              {active.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center">
                  <Users className="w-10 h-10 mx-auto text-[#94a3b8]/30 mb-3" />
                  <p className="text-[#64748b] font-medium">No active connections yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {active.map((conn) => {
                    const other = otherAgent(conn)
                    const msgCount = unapprovedCounts[conn.id] || 0
                    return (
                      <div key={conn.id} className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#0f172a]">{other?.agent_name}</p>
                              {msgCount > 0 && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#ff3b30] text-white text-xs font-bold">
                                  {msgCount}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#64748b]">{other?.company}</p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">{other?.agent_type}</span>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">{other?.llm_platform}</span>
                            </div>
                            <p className="text-xs text-[#94a3b8] mt-1">Connected {timeAgo(conn.approved_at || conn.created_at)}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => navigate(`/session/${conn.id}`)}
                              className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              Open Session
                            </button>
                            <button
                              onClick={() => navigate(`/audit/${conn.id}`)}
                              className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              View Audit
                            </button>
                            <button
                              onClick={() => setRevokeTarget(conn)}
                              className="text-red-600 hover:bg-red-50 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200"
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
                <h3 className="text-lg font-serif font-semibold text-[#0f172a] tracking-tight mb-3">Past Sessions</h3>
                <div className="space-y-3">
                  {closedConnections.map((conn) => {
                    const other = otherAgent(conn)
                    const cachedWorkflow = workflowCache[conn.id]
                    const outcomeBadge = cachedWorkflow ? getOutcomeBadge(cachedWorkflow.outcome) : null
                    return (
                      <div key={conn.id} className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm hover:shadow-md transition-shadow duration-200 opacity-90">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#0f172a]">{other?.agent_name}</p>
                              {conn.status === 'completed' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#edf5f0] text-[#2d6b4a]">
                                  <CheckCircle className="w-3 h-3" /> Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ff3b30]/10 text-[#ff3b30]">
                                  <Ban className="w-3 h-3" /> Revoked
                                </span>
                              )}
                              {outcomeBadge && (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${outcomeBadge.bg} ${outcomeBadge.text}`}>
                                  {outcomeBadge.label}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#64748b]">{other?.company}</p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">{other?.agent_type}</span>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">{other?.llm_platform}</span>
                            </div>
                            {conn.purpose && <p className="text-xs text-[#94a3b8] mt-1 italic">"{conn.purpose}"</p>}
                            <p className="text-xs text-[#94a3b8] mt-1">{timeAgo(conn.created_at)}</p>
                            {/* Workflow summary card */}
                            {cachedWorkflow && (
                              <div className="mt-2 flex items-center gap-2">
                                {cachedWorkflow.action_items?.length > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0a1628]/5 text-[#0a1628]">
                                    <ClipboardList className="w-3 h-3" />
                                    {cachedWorkflow.action_items.length} action item{cachedWorkflow.action_items.length > 1 ? 's' : ''}
                                  </span>
                                )}
                                {cachedWorkflow.follow_up_date && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f59e0b]/10 text-[#92400e]">
                                    <Calendar className="w-3 h-3" />
                                    {cachedWorkflow.follow_up_date}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {conn.status === 'completed' && (
                              <button
                                onClick={() => loadWorkflow(conn)}
                                className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Workflow
                              </button>
                            )}
                            <button
                              onClick={() => generateReport(conn)}
                              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Report
                            </button>
                            <button
                              onClick={() => navigate(`/audit/${conn.id}`)}
                              className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200"
                            >
                              Audit
                            </button>
                            <button
                              onClick={() => navigate(`/session/${conn.id}`)}
                              className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200"
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
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0ea5e9]/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#0ea5e9]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#0f172a]">Connection Report</h3>
                  <p className="text-xs text-[#94a3b8]">{reportModal.id.slice(0, 8)} — {otherAgent(reportModal)?.agent_name}</p>
                </div>
              </div>
              <button
                onClick={() => { setReportModal(null); setReportContent(null) }}
                className="text-[#94a3b8] hover:text-[#0f172a] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {reportLoading ? (
              <div className="py-12 text-center">
                <div className="w-8 h-8 border-[3px] border-[#0a1628]/20 border-t-[#0a1628] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#64748b] text-sm">Generating report...</p>
              </div>
            ) : reportContent ? (
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#f5f3ee] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#0a1628]">{reportContent.messages}</p>
                    <p className="text-xs text-[#94a3b8]">Messages</p>
                  </div>
                  <div className="bg-[#f5f3ee] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#0a1628]">{reportContent.events}</p>
                    <p className="text-xs text-[#94a3b8]">Events</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${reportModal.status === 'completed' ? 'bg-[#edf5f0]' : 'bg-[#ff3b30]/10'}`}>
                    <p className={`text-lg font-bold capitalize ${reportModal.status === 'completed' ? 'text-[#2d6b4a]' : 'text-[#ff3b30]'}`}>{reportModal.status}</p>
                    <p className="text-xs text-[#94a3b8]">Status</p>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-[#f5f3ee] rounded-xl p-4">
                  <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-1">Summary</p>
                  <p className="text-sm text-[#0f172a]">{reportContent.summary}</p>
                </div>

                {/* Outcome */}
                {reportContent.outcome && (
                  <div className="bg-[#f5f3ee] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-1">Outcome</p>
                    <p className="text-sm text-[#0f172a]">{reportContent.outcome}</p>
                  </div>
                )}

                {/* Key Topics */}
                {reportContent.keyTopics && (
                  <div className="bg-[#f5f3ee] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-2">Key Topics</p>
                    <div className="flex flex-wrap gap-2">
                      {reportContent.keyTopics.split(',').map((topic, i) => (
                        <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white text-[#0f172a]">
                          {topic.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Items */}
                {reportContent.actionItems && (
                  <div className="bg-[#f5f3ee] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-1">Action Items</p>
                    <p className="text-sm text-[#0f172a]">{reportContent.actionItems}</p>
                  </div>
                )}

                {/* Recommendation */}
                {reportContent.recommendation && (
                  <div className="bg-[#0ea5e9]/5 rounded-xl p-4">
                    <p className="text-xs font-medium text-[#0ea5e9] uppercase tracking-wider mb-1">Recommendation</p>
                    <p className="text-sm text-[#0f172a]">{reportContent.recommendation}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={downloadReport}
                    className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" />
                    Download Report
                  </button>
                  <button
                    onClick={() => navigate(`/audit/${reportModal.id}`)}
                    className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
                  >
                    View Full Audit
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Workflow Modal */}
      {workflowModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0a1628] flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-[#f59e0b]" />
                </div>
                <div>
                  <h3 className="font-serif font-semibold text-[#0a1628] text-lg">Workflow Report</h3>
                  <p className="text-xs text-[#94a3b8]">{workflowModal.id.slice(0, 8)} — {otherAgent(workflowModal)?.agent_name}</p>
                </div>
              </div>
              <button
                onClick={() => { setWorkflowModal(null); setWorkflowData(null) }}
                className="text-[#94a3b8] hover:text-[#0f172a] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {workflowLoading ? (
              <div className="py-12 text-center">
                <div className="w-8 h-8 border-[3px] border-[#0a1628]/20 border-t-[#0a1628] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#64748b] text-sm">Loading workflow report...</p>
              </div>
            ) : workflowData ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="bg-[#0a1628]/5 rounded-xl p-4 border border-[#0a1628]/10">
                  <p className="text-xs font-serif font-medium text-[#0a1628] uppercase tracking-wider mb-1">Summary</p>
                  <p className="text-sm text-[#0f172a]">{workflowData.summary}</p>
                </div>

                {/* Outcome Badge */}
                {workflowData.outcome && (() => {
                  const badge = getOutcomeBadge(workflowData.outcome)
                  return badge ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-serif font-medium text-[#0a1628] uppercase tracking-wider">Outcome:</span>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                  ) : null
                })()}

                {/* Key Topics */}
                {workflowData.key_topics?.length > 0 && (
                  <div className="bg-[#f5f3ee] rounded-xl p-4">
                    <p className="text-xs font-serif font-medium text-[#0a1628] uppercase tracking-wider mb-2">Key Topics</p>
                    <div className="flex flex-wrap gap-2">
                      {workflowData.key_topics.map((topic, i) => (
                        <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white text-[#0f172a] border border-[#e2e8f0]">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Items */}
                {workflowData.action_items?.length > 0 && (
                  <div className="bg-[#f5f3ee] rounded-xl p-4">
                    <p className="text-xs font-serif font-medium text-[#0a1628] uppercase tracking-wider mb-3">Action Items</p>
                    <div className="space-y-2">
                      {workflowData.action_items.map((item, i) => (
                        <div key={i} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-[#e2e8f0]">
                          <div className="w-5 h-5 mt-0.5 rounded border-2 border-[#0a1628]/20 flex-shrink-0 flex items-center justify-center">
                            <span className="text-xs text-[#94a3b8]">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#0f172a]">{item.action}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-[#64748b]">Owner: <span className="font-medium text-[#0a1628]">{item.owner}</span></span>
                              {item.deadline && (
                                <span className="inline-flex items-center gap-1 text-xs text-[#f59e0b]">
                                  <Calendar className="w-3 h-3" />
                                  {item.deadline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Workflow Next Steps */}
                {workflowData.workflow_next_steps?.length > 0 && (
                  <div className="bg-[#0a1628]/5 rounded-xl p-4 border border-[#0a1628]/10">
                    <p className="text-xs font-serif font-medium text-[#0a1628] uppercase tracking-wider mb-3">Workflow Next Steps</p>
                    <div className="space-y-2">
                      {workflowData.workflow_next_steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#0a1628] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                            {step.step || i + 1}
                          </div>
                          <div className="flex-1 pt-1">
                            <p className="text-sm text-[#0f172a]">{step.description}</p>
                            {step.responsible && (
                              <p className="text-xs text-[#64748b] mt-0.5 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" />
                                {step.responsible}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up Date */}
                {workflowData.follow_up_date && (
                  <div className="bg-[#fef3c7] rounded-xl p-4 flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-[#f59e0b]" />
                    <div>
                      <p className="text-xs font-serif font-medium text-[#92400e] uppercase tracking-wider">Follow-up Date</p>
                      <p className="text-sm font-medium text-[#92400e]">{workflowData.follow_up_date}</p>
                    </div>
                  </div>
                )}

                {/* Recommendation */}
                {workflowData.recommendation && (
                  <div className="bg-[#0ea5e9]/5 rounded-xl p-4 border border-[#0ea5e9]/20">
                    <p className="text-xs font-serif font-medium text-[#0ea5e9] uppercase tracking-wider mb-1">Recommendation</p>
                    <p className="text-sm text-[#0f172a]">{workflowData.recommendation}</p>
                  </div>
                )}

                {/* Risk Flags */}
                {workflowData.risk_flags?.length > 0 && workflowData.risk_flags[0] !== '' && (
                  <div className="bg-[#ff3b30]/5 rounded-xl p-4 border border-[#ff3b30]/20">
                    <p className="text-xs font-serif font-medium text-[#ff3b30] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Risk Flags
                    </p>
                    <ul className="space-y-1">
                      {workflowData.risk_flags.map((flag, i) => (
                        <li key={i} className="text-sm text-[#ff3b30]/80 flex items-start gap-2">
                          <span className="text-[#ff3b30] mt-1">-</span>
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={downloadWorkflow}
                    className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200 flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Download Workflow
                  </button>
                  <button
                    onClick={() => navigate(`/audit/${workflowModal.id}`)}
                    className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
                  >
                    View Full Audit
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <ClipboardList className="w-10 h-10 mx-auto text-[#94a3b8]/30 mb-3" />
                <p className="text-[#64748b] font-medium">No workflow report available</p>
                <p className="text-sm text-[#94a3b8] mt-1">Reports are generated when background sessions complete</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0a1628] flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-[#f59e0b]" />
                </div>
                <div>
                  <h3 className="font-serif font-semibold text-[#0f172a] text-lg">Edit Agent</h3>
                  <p className="text-xs text-[#94a3b8]">Update your agent's profile and identity</p>
                </div>
              </div>
              <button onClick={() => setEditModal(false)} className="text-[#94a3b8] hover:text-[#0f172a] transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Agent Name</label>
                <input
                  value={editForm.agent_name}
                  onChange={(e) => setEditForm({ ...editForm, agent_name: e.target.value })}
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Company Name</label>
                <input
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Agent Type</label>
                  <select
                    value={editForm.agent_type}
                    onChange={(e) => setEditForm({ ...editForm, agent_type: e.target.value })}
                    className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30"
                  >
                    {['Employer / Hiring','Staffing Agency','Legal / Paralegal','Medical Practice','Solopreneur','Procurement','Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0f172a] mb-1.5">LLM Platform</label>
                  <select
                    value={editForm.llm_platform}
                    onChange={(e) => setEditForm({ ...editForm, llm_platform: e.target.value })}
                    className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30"
                  >
                    {['OpenAI (GPT)','Microsoft Copilot','Google Gemini','Claude (Anthropic)','OpenClaw','LangChain','Other'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">
                  Agent Identity (soul.md)
                  <span className="ml-2 text-xs text-[#94a3b8] font-normal">Private — only you can see this</span>
                </label>
                <textarea
                  value={editForm.soul_md}
                  onChange={(e) => setEditForm({ ...editForm, soul_md: e.target.value })}
                  rows={5}
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 resize-none"
                  placeholder="Define your agent's identity, authority, and rules..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">
                  Agent Capabilities (skill.md)
                  <span className="ml-2 text-xs text-[#94a3b8] font-normal">Private — only you can see this</span>
                </label>
                <textarea
                  value={editForm.skill_md}
                  onChange={(e) => setEditForm({ ...editForm, skill_md: e.target.value })}
                  rows={5}
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 resize-none"
                  placeholder="Define what your agent can share, cannot share, and requires approval for..."
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditModal(false)}
                className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editForm.agent_name || !editForm.company}
                className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-all duration-200"
              >
                {editSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#ff3b30]/10 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-[#ff3b30]" />
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
            <p className="text-sm text-[#64748b] mb-6">
              This action cannot be undone. The other agent will no longer be able to send messages in this session.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRevokeTarget(null)}
                className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeConnection(revokeTarget)}
                disabled={actionLoading === revokeTarget.id}
                className="bg-[#ff3b30] hover:bg-[#ff453a] text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-all duration-200"
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
