import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, Shield, Users } from 'lucide-react'

const typeColors = {
  'Employer / Hiring': '#0a1628',
  'Staffing Agency': '#1e3a5f',
  'Legal / Paralegal': '#f59e0b',
  'Medical Practice': '#2d6b4a',
  'Solopreneur': '#0ea5e9',
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
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-[#f5f3ee]" />
        <div className="flex-1">
          <div className="h-4 bg-[#f5f3ee] rounded-xl w-2/3 mb-2" />
          <div className="h-3 bg-[#f5f3ee] rounded-xl w-1/2" />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="h-7 bg-[#f5f3ee] rounded-full w-24" />
        <div className="h-7 bg-[#f5f3ee] rounded-full w-20" />
      </div>
      <div className="h-3 bg-[#f5f3ee] rounded-xl w-full mb-2" />
      <div className="h-3 bg-[#f5f3ee] rounded-xl w-3/4 mb-5" />
      <div className="flex gap-3">
        <div className="h-9 bg-[#f5f3ee] rounded-lg flex-1" />
        <div className="h-9 bg-[#f5f3ee] rounded-lg flex-1" />
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
        .select('id, agent_name, company, agent_type, llm_platform, qr_token, created_at')
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
    const matchesVerified = !verifiedOnly || true // All registered agents are verified
    return matchesSearch && matchesType && matchesPlatform && matchesVerified
  })

  return (
    <div className="min-h-screen bg-[#fffef9]">
      {/* Nav */}
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
              className="text-sm font-medium text-[#0ea5e9]"
            >
              Directory
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="text-sm text-[#64748b] hover:text-[#0f172a] border border-[#e2e8f0] rounded-lg px-4 py-1.5 hover:bg-[#f5f3ee] transition-all duration-200"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif font-bold text-[#0f172a] tracking-tight mb-3">Agent Directory</h1>
          <p className="text-lg text-[#64748b]">Find verified agents to connect with</p>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm mb-8">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                placeholder="Search by name, company, or type..."
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
            >
              <option value="">All Agent Types</option>
              {agentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
            >
              <option value="">All Platforms</option>
              {llmPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-2 cursor-pointer px-4 py-3 bg-[#f5f3ee] rounded-lg hover:bg-[#e8e5de] transition-all duration-200">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#94a3b8] text-[#0a1628] focus:ring-[#0ea5e9]"
              />
              <span className="text-sm text-[#0f172a] whitespace-nowrap">Verified Only</span>
            </label>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-[#ff3b30]/5 rounded-xl p-6 text-center mb-6">
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
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-16 shadow-sm text-center">
            <Users className="w-12 h-12 mx-auto text-[#94a3b8]/30 mb-4" />
            <p className="text-[#64748b] font-medium text-lg">No agents found matching your search</p>
            <p className="text-sm text-[#94a3b8] mt-1">Try adjusting your filters or search terms</p>
          </div>
        )}

        {/* Agent Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent) => {
              const color = typeColors[agent.agent_type] || '#64748b'
              const isVerified = true // All registered agents are verified on Agent OnBoard
              // soul_md content is private — only show verification status

              return (
                <div key={agent.id} className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm hover:shadow-md transition-all duration-200">
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
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">
                      {agent.agent_type}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#0ea5e9]/10 text-[#0ea5e9]">
                      {agent.llm_platform}
                    </span>
                  </div>

                  {isVerified && (
                    <div className="flex items-center gap-1 mb-3 text-[#2d6b4a]">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Verified</span>
                    </div>
                  )}

                  <div className="mb-4" />

                  <div className="flex gap-3">
                    <button
                      onClick={() => navigate(`/connect?token=${agent.qr_token}`)}
                      className="flex-1 bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => navigate(`/agent/${agent.id}`)}
                      className="flex-1 bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200"
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
