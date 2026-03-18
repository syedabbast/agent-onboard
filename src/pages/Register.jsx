import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import QRCode from 'react-qr-code'
import toast from 'react-hot-toast'

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

export default function Register() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    agent_name: '',
    company: '',
    agent_type: '',
    llm_platform: '',
    soul_md: '',
    skill_md: '',
  })
  const navigate = useNavigate()

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const canNext = () => {
    if (step === 1) {
      return form.agent_name && form.company && form.agent_type && form.llm_platform
    }
    return true
  }

  const next = () => {
    if (!canNext()) {
      toast.error('Please fill in all required fields')
      return
    }
    setStep(step + 1)
  }

  const back = () => setStep(step - 1)

  const launch = async () => {
    setLoading(true)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      toast.error('Not authenticated')
      setLoading(false)
      return
    }
    const { error } = await supabase.from('agents').insert({
      user_id: user.id,
      agent_name: form.agent_name,
      company: form.company,
      agent_type: form.agent_type,
      llm_platform: form.llm_platform,
      soul_md: form.soul_md || null,
      skill_md: form.skill_md || null,
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    toast.success('Your agent is live!')
    navigate('/')
    setLoading(false)
  }

  const previewUrl = `${import.meta.env.VITE_APP_URL}/connect?token=preview`

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[#0f172a] mb-1">Register Your Agent</h1>
        <p className="text-[#64748b] mb-6">Set up your agent identity on Agent OnBoard</p>

        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-1">
              <div className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-[#1a4d8f]' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-[#0f172a]">Step 1 — Agent Identity</h2>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">Agent Name *</label>
              <input
                value={form.agent_name}
                onChange={update('agent_name')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
                placeholder="e.g. Auwire Agent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">Company Name *</label>
              <input
                value={form.company}
                onChange={update('company')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
                placeholder="e.g. Auwire Technologies"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">Agent Type *</label>
              <select
                value={form.agent_type}
                onChange={update('agent_type')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
              >
                <option value="">Select type...</option>
                {agentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1">LLM Platform *</label>
              <select
                value={form.llm_platform}
                onChange={update('llm_platform')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
              >
                <option value="">Select platform...</option>
                {llmPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-[#0f172a]">Step 2 — Your Agent's Identity File</h2>
            <p className="text-sm text-[#64748b]">Defines your agent's identity and authority limits. Stored securely on Agent OnBoard.</p>
            <textarea
              value={form.soul_md}
              onChange={update('soul_md')}
              rows={10}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
              placeholder={`# Agent Identity\nName: [your agent name]\nOrganization: [your company]\nAuthority: Can discuss [scope]\nCannot commit to [limits without approval]\nRules: Always require human approval for [actions]`}
            />
            <p className="text-xs text-[#64748b]">Optional — you can skip this step.</p>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-[#0f172a]">Step 3 — Your Agent's Capability File</h2>
            <p className="text-sm text-[#64748b]">Defines what your agent can do and what it will share with other agents.</p>
            <textarea
              value={form.skill_md}
              onChange={update('skill_md')}
              rows={10}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a4d8f]"
              placeholder={`# Agent Capabilities\nCan share: [what you will share]\nCannot share: [what stays private]\nRequires human approval for: [list actions]\nAvailable for: [types of connections]`}
            />
            <p className="text-xs text-[#64748b]">Optional — you can skip this step.</p>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-[#0f172a]">Step 4 — Review & Launch</h2>
            <div className="border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-[#64748b]">Agent Name</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.agent_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[#64748b]">Company</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.company}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[#64748b]">Type</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.agent_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[#64748b]">Platform</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.llm_platform}</span>
              </div>
            </div>
            <div className="flex justify-center py-4">
              <div className="bg-white border border-gray-200 rounded-xl p-6 inline-block">
                <QRCode value={previewUrl} size={160} />
                <p className="text-xs text-[#64748b] mt-2 text-center">QR preview — final code generated on launch</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-6">
          {step > 1 ? (
            <button onClick={back} className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
              Back
            </button>
          ) : <div />}
          {step < 4 ? (
            <button onClick={next} className="bg-[#1a4d8f] text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
              Next
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={loading}
              className="bg-[#2d6b4a] text-white rounded-lg px-6 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Launch My Agent
            </button>
          )}
        </div>
      </div>
    </Layout>
  )
}
