import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, Shield, Users } from 'lucide-react'

const typeColors = {
  'Employer / Hiring': '#1a4d8f',
  'Staffing Agency': '#7c3aed',
  'Legal / Paralegal': '#b45309',
  'Medical Practice': '#16a34a',
  'Solopreneur': '#8f3a1a',
  'Procurement': '#0891b2',
  'Other': '#64748b',
}

const agentTypes = [
  'Employer / Hiring',
  'Staffing Agency',
  'Legal / Paralegal',
  'Medical Practice',
  'Solopreneur',
  'Procurement',
  'Other',
]

const llmPlatforms = [
  'OpenAI (GPT)',
  'Microsoft Copilot',
  'Google Gemini',
  'Claude (Anthropic)',
  'OpenClaw',
  'LangChain',
  'Other',
]

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-gray-200" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="h-6 bg-gray-200 rounded-full w-24" />
        <div className="h-6 bg-gray-200 rounded-full w-20" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-full mb-2" />
      <div className="h-3 bg-gray-200 rounded w-3/4 mb-4" />
      <div className="flex gap-2">
        <div className="h-8 bg-gray-200 rounded-lg flex-1" />
        <div className="h-8 bg-gray-200 rounded-lg flex-1" />
      </div>
    </div>
  )
}

export default function Directory() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const loadAgents = async () => {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false })
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      setAgents(data || [])
      setLoading(false)
    }
    loadAgents()
  }, [])

  const filtered = agents.filter((agent) => {
    const term = search.toLowerCase()
    const matchesSearch = !term ||
      agent.agent_name?.toLowerCase().includes(term) ||
      agent.company?.toLowerCase().includes(term) ||
      agent.agent_type?.toLowerCase().includes(term)
    const matchesType = !typeFilter || agent.agent_type === typeFilter
    const matchesPlatform = !platformFilter || agent.llm_platform === platformFilter
    const matchesVerified = !verifiedOnly || (agent.soul_md && agent.soul_md.trim().length > 0)
    return matchesSearch && matchesType && matchesPlatform && matchesVerified
  })

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
          <span className="font-bold text-[#0f172a] text-lg">Agent OnBoard</span>
          <span className="text-sm text-[#64748b]">by Auwire Technologies</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/directory')}
            className="text-sm font-medium text-[#1a4d8f] border-b-2 border-[#1a4d8f] pb-0.5"
          >
            Directory
          </button>
          <button
            onClick={() => navigate('/auth')}
            className="text-sm text-[#64748b] hover:text-[#0f172a] border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            Sign In
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#0f172a] mb-2">Agent Directory</h1>
          <p className="text-[#64748b]">Find verified agents to connect with</p>
        </div>

        {/* Search & Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
                placeholder="Search by name, company, or type..."
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
            >
              <option value="">All Agent Types</option>
              {agentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
            >
              <option value="">All Platforms</option>
              {llmPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#2d6b4a] focus:ring-[#2d6b4a]"
              />
              <span className="text-sm text-[#0f172a] whitespace-nowrap">Verified Only</span>
            </label>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mb-6">
            <p className="text-red-600 font-medium">Failed to load agents</p>
            <p className="text-sm text-red-500 mt-1">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm text-center">
            <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-[#64748b] font-medium text-lg">No agents found matching your search</p>
            <p className="text-sm text-[#64748b] mt-1">Try adjusting your filters or search terms</p>
          </div>
        )}

        {/* Agent Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent) => {
              const color = typeColors[agent.agent_type] || '#64748b'
              const isVerified = agent.soul_md && agent.soul_md.trim().length > 0
              const bio = agent.soul_md ? agent.soul_md.slice(0, 100) + (agent.soul_md.length > 100 ? '...' : '') : null

              return (
                <div key={agent.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      <span className="text-lg font-bold text-white">{getInitials(agent.agent_name)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[#0f172a] truncate">{agent.agent_name}</p>
                      <p className="text-sm text-[#64748b] truncate">{agent.company}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3 flex-wrap">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#1a4d8f]">
                      {agent.agent_type}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                      {agent.llm_platform}
                    </span>
                  </div>

                  {isVerified && (
                    <div className="flex items-center gap-1 mb-3 text-[#2d6b4a]">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Verified</span>
                    </div>
                  )}

                  {bio && (
                    <p className="text-xs text-[#64748b] mb-4 line-clamp-2">{bio}</p>
                  )}
                  {!bio && <div className="mb-4" />}

                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/connect?token=${agent.qr_token}`)}
                      className="flex-1 bg-[#1a4d8f] text-white rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90"
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => navigate(`/agent/${agent.id}`)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
