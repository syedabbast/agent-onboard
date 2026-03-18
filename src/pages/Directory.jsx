import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, Shield, Users } from 'lucide-react'

const typeColors = {
  'Employer / Hiring': '#0071e3',
  'Staffing Agency': '#7c3aed',
  'Legal / Paralegal': '#ff9500',
  'Medical Practice': '#34c759',
  'Solopreneur': '#ff3b30',
  'Procurement': '#0891b2',
  'Other': '#86868b',
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
    <div className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-[#f5f5f7]" />
        <div className="flex-1">
          <div className="h-4 bg-[#f5f5f7] rounded-xl w-2/3 mb-2" />
          <div className="h-3 bg-[#f5f5f7] rounded-xl w-1/2" />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="h-7 bg-[#f5f5f7] rounded-full w-24" />
        <div className="h-7 bg-[#f5f5f7] rounded-full w-20" />
      </div>
      <div className="h-3 bg-[#f5f5f7] rounded-xl w-full mb-2" />
      <div className="h-3 bg-[#f5f5f7] rounded-xl w-3/4 mb-5" />
      <div className="flex gap-3">
        <div className="h-9 bg-[#f5f5f7] rounded-full flex-1" />
        <div className="h-9 bg-[#f5f5f7] rounded-full flex-1" />
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
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#0071e3]" />
            <span className="font-semibold text-[#1d1d1f] text-lg tracking-tight">Agent OnBoard</span>
            <span className="text-sm text-[#86868b]">by Auwire Technologies</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/directory')}
              className="text-sm font-medium text-[#0071e3]"
            >
              Directory
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] rounded-full px-4 py-1.5 hover:bg-black/5 transition-all duration-200"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-[#1d1d1f] tracking-tight mb-3">Agent Directory</h1>
          <p className="text-lg text-[#6e6e73]">Find verified agents to connect with</p>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-8">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#f5f5f7] border-0 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
                placeholder="Search by name, company, or type..."
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
            >
              <option value="">All Agent Types</option>
              {agentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
            >
              <option value="">All Platforms</option>
              {llmPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-2 cursor-pointer px-4 py-3 bg-[#f5f5f7] rounded-xl hover:bg-[#e8e8ed] transition-all duration-200">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#86868b] text-[#0071e3] focus:ring-[#0071e3]"
              />
              <span className="text-sm text-[#1d1d1f] whitespace-nowrap">Verified Only</span>
            </label>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-[#ff3b30]/5 rounded-2xl p-6 text-center mb-6">
            <p className="text-[#ff3b30] font-medium">Failed to load agents</p>
            <p className="text-sm text-[#ff3b30]/70 mt-1">{error}</p>
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
          <div className="bg-white rounded-2xl p-16 shadow-sm text-center">
            <Users className="w-12 h-12 mx-auto text-[#86868b]/30 mb-4" />
            <p className="text-[#6e6e73] font-medium text-lg">No agents found matching your search</p>
            <p className="text-sm text-[#86868b] mt-1">Try adjusting your filters or search terms</p>
          </div>
        )}

        {/* Agent Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent) => {
              const color = typeColors[agent.agent_type] || '#86868b'
              const isVerified = agent.soul_md && agent.soul_md.trim().length > 0
              const bio = agent.soul_md ? agent.soul_md.slice(0, 100) + (agent.soul_md.length > 100 ? '...' : '') : null

              return (
                <div key={agent.id} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      <span className="text-lg font-bold text-white">{getInitials(agent.agent_name)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[#1d1d1f] truncate">{agent.agent_name}</p>
                      <p className="text-sm text-[#6e6e73] truncate">{agent.company}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">
                      {agent.agent_type}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">
                      {agent.llm_platform}
                    </span>
                  </div>

                  {isVerified && (
                    <div className="flex items-center gap-1 mb-3 text-[#34c759]">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Verified</span>
                    </div>
                  )}

                  {bio && (
                    <p className="text-xs text-[#86868b] mb-4 line-clamp-2">{bio}</p>
                  )}
                  {!bio && <div className="mb-4" />}

                  <div className="flex gap-3">
                    <button
                      onClick={() => navigate(`/connect?token=${agent.qr_token}`)}
                      className="flex-1 bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-3 py-2 text-sm font-medium transition-all duration-200"
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => navigate(`/agent/${agent.id}`)}
                      className="flex-1 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-3 py-2 text-sm font-medium transition-all duration-200"
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
