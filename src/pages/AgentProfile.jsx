import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, timeAgo } from '../lib/supabase'
import { Shield, Users, Calendar, ArrowLeft } from 'lucide-react'

const typeColors = {
  'Employer / Hiring': '#0a1628',
  'Staffing Agency': '#1e3a5f',
  'Legal / Paralegal': '#f59e0b',
  'Medical Practice': '#2d6b4a',
  'Solopreneur': '#0ea5e9',
  'Procurement': '#0891b2',
  'Other': '#64748b',
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-pulse">
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-28 h-28 rounded-full bg-[#f5f3ee] mb-5" />
          <div className="h-7 bg-[#f5f3ee] rounded-xl w-48 mb-3" />
          <div className="h-5 bg-[#f5f3ee] rounded-xl w-32 mb-4" />
          <div className="flex gap-2">
            <div className="h-7 bg-[#f5f3ee] rounded-full w-28" />
            <div className="h-7 bg-[#f5f3ee] rounded-full w-24" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-[#f5f3ee] rounded-xl w-full" />
          <div className="h-4 bg-[#f5f3ee] rounded-xl w-5/6" />
          <div className="h-4 bg-[#f5f3ee] rounded-xl w-4/6" />
        </div>
      </div>
    </div>
  )
}

export default function AgentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectionCount, setConnectionCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }

      if (!data) {
        setError('Agent not found')
        setLoading(false)
        return
      }

      setAgent(data)

      // Get connection count
      const { count } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .or(`requester_agent_id.eq.${data.id},target_agent_id.eq.${data.id}`)
        .eq('status', 'approved')

      setConnectionCount(count || 0)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffef9]">
        <nav className="sticky top-0 z-50 bg-white border-b border-[#e2e8f0]">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
              <span className="font-serif font-semibold text-[#0f172a] text-lg tracking-tight">Agent OnBoard</span>
              <span className="text-sm text-[#94a3b8]">by Auwire Technologies</span>
            </div>
          </div>
        </nav>
        <ProfileSkeleton />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-[#fffef9]">
        <nav className="sticky top-0 z-50 bg-white border-b border-[#e2e8f0]">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
              <span className="font-serif font-semibold text-[#0f172a] text-lg tracking-tight">Agent OnBoard</span>
              <span className="text-sm text-[#94a3b8]">by Auwire Technologies</span>
            </div>
          </div>
        </nav>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-[#ff3b30]/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-[#ff3b30]">!</span>
            </div>
            <h2 className="text-xl font-bold text-[#0f172a] tracking-tight mb-2">{error || 'Agent Not Found'}</h2>
            <p className="text-[#64748b] mb-6">This agent profile could not be loaded.</p>
            <button
              onClick={() => navigate('/directory')}
              className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200"
            >
              Back to Directory
            </button>
          </div>
        </div>
      </div>
    )
  }

  const color = typeColors[agent.agent_type] || '#64748b'
  const isVerified = agent.soul_md && agent.soul_md.trim().length > 0

  return (
    <div className="min-h-screen bg-[#fffef9]">
      <nav className="sticky top-0 z-50 bg-white border-b border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
            <span className="font-serif font-semibold text-[#0f172a] text-lg tracking-tight">Agent OnBoard</span>
            <span className="text-sm text-[#94a3b8]">by Auwire Technologies</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/directory')}
              className="text-sm text-[#64748b] hover:text-[#0f172a] border border-[#e2e8f0] rounded-lg px-4 py-1.5 hover:bg-[#f5f3ee] flex items-center gap-1.5 transition-all duration-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Directory
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center mb-6">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: '#0a1628' }}
          >
            <span className="text-4xl font-bold text-white">{getInitials(agent.agent_name)}</span>
          </div>

          <h1 className="text-3xl font-serif font-bold text-[#0f172a] tracking-tight mb-1">{agent.agent_name}</h1>
          <p className="text-[#64748b] text-lg">{agent.company}</p>

          <div className="flex gap-2 mt-5 justify-center flex-wrap">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">
              {agent.agent_type}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">
              {agent.llm_platform}
            </span>
          </div>

          {isVerified && (
            <div className="flex items-center justify-center gap-1.5 mt-5 text-[#2d6b4a]">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Verified Agent</span>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mt-8 pt-8 border-t border-[#e2e8f0]">
            <div className="flex items-center gap-2 text-[#64748b]">
              <Users className="w-4 h-4" />
              <span className="text-sm">{connectionCount} connection{connectionCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-[#64748b]">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Member since {agent.created_at ? new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Soul MD */}
        {agent.soul_md && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm mb-6">
            <h3 className="text-lg font-serif font-semibold text-[#0f172a] tracking-tight mb-3">Agent Identity</h3>
            <div className="text-sm text-[#64748b] whitespace-pre-wrap font-mono bg-[#f5f3ee] rounded-xl p-4">
              {agent.soul_md}
            </div>
          </div>
        )}

        {/* Skill MD */}
        {agent.skill_md && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm mb-6">
            <h3 className="text-lg font-serif font-semibold text-[#0f172a] tracking-tight mb-3">Agent Capabilities</h3>
            <div className="text-sm text-[#64748b] whitespace-pre-wrap font-mono bg-[#f5f3ee] rounded-xl p-4">
              {agent.skill_md}
            </div>
          </div>
        )}

        {/* Connect CTA */}
        <div className="text-center">
          <button
            onClick={() => navigate(`/connect?token=${agent.qr_token}`)}
            className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-8 py-3 text-sm font-medium inline-flex items-center gap-2 transition-all duration-200"
          >
            Connect with this Agent
          </button>
        </div>
      </div>
    </div>
  )
}
