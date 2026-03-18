import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getMyAgent, timeAgo } from '../lib/supabase'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'

const actionLabels = {
  connection_requested: 'Requested connection',
  connection_approved: 'Approved connection',
  connection_declined: 'Declined connection',
  connection_revoked: 'Revoked connection',
  session_completed: 'Session completed',
  message_sent: 'Sent a message',
  message_approved: 'Approved a message',
}

export default function Audit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])
  const [connection, setConnection] = useState(null)
  const [myAgent, setMyAgent] = useState(null)
  const [agents, setAgents] = useState({})
  const [expanded, setExpanded] = useState({})

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
        navigate('/dashboard')
        return
      }
      setConnection(conn)

      const agentMap = {}
      if (conn.requester) agentMap[conn.requester.id] = conn.requester
      if (conn.target) agentMap[conn.target.id] = conn.target
      setAgents(agentMap)

      const { data: logs } = await supabase
        .from('audit_log')
        .select('*')
        .eq('connection_id', id)
        .order('created_at', { ascending: false })
      setEntries(logs || [])
      setLoading(false)
    }
    load()
  }, [id])

  const toggleExpand = (entryId) => {
    setExpanded(prev => ({ ...prev, [entryId]: !prev[entryId] }))
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-${id.slice(0, 8)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const getDotColor = (entry) => {
    if (!entry.agent_id) return 'bg-[#2d6b4a]'
    if (entry.agent_id === myAgent?.id) return 'bg-[#0a1628]'
    return 'bg-[#f59e0b]'
  }

  if (loading) return <Layout activeAgentName={myAgent?.agent_name}><Spinner /></Layout>

  return (
    <Layout activeAgentName={myAgent?.agent_name}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#0f172a] tracking-tight">Audit Trail</h1>
          </div>
          <button
            onClick={() => navigate(`/session/${id}`)}
            className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
          >
            Back to Session
          </button>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm mb-8">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[#94a3b8]">Session ID</p>
              <p className="font-mono text-sm font-medium text-[#0f172a] mt-1">{id.slice(0, 8)}</p>
            </div>
            <div>
              <p className="text-xs text-[#94a3b8]">Started</p>
              <p className="text-sm font-medium text-[#0f172a] mt-1">{connection?.created_at ? new Date(connection.created_at).toLocaleString() : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-[#94a3b8]">Total Events</p>
              <p className="text-sm font-medium text-[#0f172a] mt-1">{entries.length}</p>
            </div>
          </div>
        </div>

        {/* Entries */}
        <div className="space-y-2 mb-8">
          {entries.map((entry) => {
            const agent = agents[entry.agent_id]
            const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(entry)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-sm font-medium text-[#0f172a]">{agent?.agent_name || 'System'}</span>
                      <span className="text-xs text-[#94a3b8]">{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-[#64748b]">{actionLabels[entry.action] || entry.action}</p>
                    {hasMeta && (
                      <div className="mt-1.5">
                        <button onClick={() => toggleExpand(entry.id)} className="text-xs text-[#0ea5e9] hover:bg-[#0ea5e9]/5 rounded-lg px-2 py-0.5 transition-all duration-200">
                          {expanded[entry.id] ? 'Hide details' : 'Show details'}
                        </button>
                        {expanded[entry.id] && (
                          <pre className="mt-2 text-xs bg-[#f5f3ee] rounded-xl p-3 overflow-x-auto">{JSON.stringify(entry.metadata, null, 2)}</pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {entries.length === 0 && (
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center">
              <p className="text-[#64748b]">No audit entries yet</p>
            </div>
          )}
        </div>

        <button
          onClick={exportJSON}
          className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
        >
          Export as JSON
        </button>
      </div>
    </Layout>
  )
}
