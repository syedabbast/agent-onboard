import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, timeAgo } from '../lib/supabase'
import { Shield, Users, Calendar, ArrowLeft } from 'lucide-react'

const typeColors = {
  'Employer / Hiring': '#1a4d8f',
  'Staffing Agency': '#7c3aed',
  'Legal / Paralegal': '#b45309',
  'Medical Practice': '#16a34a',
  'Solopreneur': '#8f3a1a',
  'Procurement': '#0891b2',
  'Other': '#64748b',
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse">
      <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-24 h-24 rounded-full bg-gray-200 mb-4" />
          <div className="h-6 bg-gray-200 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
          <div className="flex gap-2">
            <div className="h-6 bg-gray-200 rounded-full w-28" />
            <div className="h-6 bg-gray-200 rounded-full w-24" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-4/6" />
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
      <div className="min-h-screen bg-[#f8fafc]">
        <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
            <span className="font-bold text-[#0f172a] text-lg">Agent OnBoard</span>
            <span className="text-sm text-[#64748b]">by Auwire Technologies</span>
          </div>
        </nav>
        <ProfileSkeleton />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
            <span className="font-bold text-[#0f172a] text-lg">Agent OnBoard</span>
            <span className="text-sm text-[#64748b]">by Auwire Technologies</span>
          </div>
        </nav>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-red-500">!</span>
            </div>
            <h2 className="text-xl font-bold text-[#0f172a] mb-2">{error || 'Agent Not Found'}</h2>
            <p className="text-[#64748b] mb-4">This agent profile could not be loaded.</p>
            <button
              onClick={() => navigate('/directory')}
              className="bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm hover:opacity-90"
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
    <div className="min-h-screen bg-[#f8fafc]">
      <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
          <span className="font-bold text-[#0f172a] text-lg">Agent OnBoard</span>
          <span className="text-sm text-[#64748b]">by Auwire Technologies</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/directory')}
            className="text-sm text-[#64748b] hover:text-[#0f172a] border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Directory
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Profile Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center mb-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: color }}
          >
            <span className="text-3xl font-bold text-white">{getInitials(agent.agent_name)}</span>
          </div>

          <h1 className="text-2xl font-bold text-[#0f172a] mb-1">{agent.agent_name}</h1>
          <p className="text-[#64748b] text-lg">{agent.company}</p>

          <div className="flex gap-2 mt-4 justify-center flex-wrap">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">
              {agent.agent_type}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
              {agent.llm_platform}
            </span>
          </div>

          {isVerified && (
            <div className="flex items-center justify-center gap-1 mt-4 text-[#2d6b4a]">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Verified Agent</span>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t border-gray-200">
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
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <h3 className="text-lg font-semibold text-[#0f172a] mb-3">Agent Identity</h3>
            <div className="text-sm text-[#64748b] whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4">
              {agent.soul_md}
            </div>
          </div>
        )}

        {/* Skill MD */}
        {agent.skill_md && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <h3 className="text-lg font-semibold text-[#0f172a] mb-3">Agent Capabilities</h3>
            <div className="text-sm text-[#64748b] whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4">
              {agent.skill_md}
            </div>
          </div>
        )}

        {/* Connect CTA */}
        <div className="text-center">
          <button
            onClick={() => navigate(`/connect?token=${agent.qr_token}`)}
            className="bg-[#1a4d8f] text-white rounded-lg px-8 py-3 text-sm font-medium hover:opacity-90 inline-flex items-center gap-2"
          >
            Connect with this Agent
          </button>
        </div>
      </div>
    </div>
  )
}
