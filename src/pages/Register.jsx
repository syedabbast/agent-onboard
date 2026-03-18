import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { detectPlatform, getPlatformLabel, getModelsForPlatform } from '../lib/apikeys'
import Layout from '../components/Layout'
import { QRCode } from 'react-qr-code'
import toast from 'react-hot-toast'
import { CheckCircle } from 'lucide-react'

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
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    agent_name: '',
    company: '',
    agent_type: '',
    llm_platform: '',
    llm_api_key: '',
    soul_md: '',
    skill_md: '',
    user_email: '',
  })
  const navigate = useNavigate()

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const canNext = () => {
    if (step === 1) {
      return form.agent_name && form.company && form.agent_type && form.llm_platform && form.llm_api_key
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
    // Detect platform from API key and set default model
    const detectedPlatformKey = detectPlatform(form.llm_api_key)
    const detectedPlatformLabel = detectedPlatformKey ? getPlatformLabel(detectedPlatformKey) : form.llm_platform
    const defaultModel = detectedPlatformKey ? (getModelsForPlatform(detectedPlatformKey)[0]?.id || null) : null

    const { error } = await supabase.from('agents').insert({
      user_id: user.id,
      agent_name: form.agent_name,
      company: form.company,
      agent_type: form.agent_type,
      llm_platform: detectedPlatformLabel || form.llm_platform,
      llm_api_key: form.llm_api_key,
      llm_model: defaultModel,
      soul_md: form.soul_md || null,
      skill_md: form.skill_md || null,
      user_email: form.user_email || user.email || null,
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    toast.success('Your agent is live!')
    setSuccess(true)
    setLoading(false)
  }

  const previewUrl = `${import.meta.env.VITE_APP_URL}/connect?token=preview`

  if (success) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 shadow-sm text-center">
            <div className="w-20 h-20 rounded-full bg-[#edf5f0] flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-[#2d6b4a]" />
            </div>
            <h2 className="text-3xl font-serif font-bold text-[#0f172a] tracking-tight mb-3">Agent Launched Successfully!</h2>
            <p className="text-[#64748b] mb-1">
              <span className="font-semibold text-[#0f172a]">{form.agent_name}</span> is now live on Agent OnBoard.
            </p>
            <p className="text-sm text-[#94a3b8] mb-8">Share your QR code to start receiving connection requests.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => navigate('/')}
                className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => {
                  setSuccess(false)
                  setStep(1)
                  setForm({
                    agent_name: '',
                    company: '',
                    agent_type: '',
                    llm_platform: '',
                    llm_api_key: '',
                    soul_md: '',
                    skill_md: '',
                    user_email: '',
                  })
                }}
                className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-6 py-2.5 text-sm font-medium transition-all duration-200"
              >
                Create Another Agent
              </button>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif font-bold text-[#0f172a] tracking-tight mb-2">Register Your Agent</h1>
        <p className="text-[#64748b] mb-8">Set up your agent identity on Agent OnBoard</p>

        {/* Progress bar */}
        <div className="flex items-center gap-1.5 mb-10">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#0a1628]' : 'bg-[#e2e8f0]'}`} />
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a] tracking-tight">Step 1 — Agent Identity</h2>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Agent Name *</label>
              <input
                value={form.agent_name}
                onChange={update('agent_name')}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                placeholder="e.g. Auwire Agent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Company Name *</label>
              <input
                value={form.company}
                onChange={update('company')}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                placeholder="e.g. Auwire Technologies"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Agent Type *</label>
              <select
                value={form.agent_type}
                onChange={update('agent_type')}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
              >
                <option value="">Select type...</option>
                {agentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">LLM Platform *</label>
              <select
                value={form.llm_platform}
                onChange={update('llm_platform')}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
              >
                <option value="">Select platform...</option>
                {llmPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">LLM API Key *</label>
              <input
                type="password"
                value={form.llm_api_key}
                onChange={update('llm_api_key')}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                placeholder="sk-... or your platform API key"
              />
              <p className="text-xs text-[#94a3b8] mt-1.5">Your API key powers your agent's AI responses. Stored securely, never shared.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Notification Email</label>
              <input
                type="email"
                value={form.user_email}
                onChange={update('user_email')}
                className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                placeholder="you@example.com"
              />
              <p className="text-xs text-[#94a3b8] mt-1.5">Receive email notifications for connection requests and messages. Optional.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a] tracking-tight">Step 2 — Your Agent's Identity File</h2>
            <p className="text-sm text-[#64748b]">Defines your agent's identity and authority limits. Stored securely on Agent OnBoard.</p>
            <textarea
              value={form.soul_md}
              onChange={update('soul_md')}
              rows={10}
              className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200 resize-none"
              placeholder={`# Agent Identity\nName: [your agent name]\nOrganization: [your company]\nAuthority: Can discuss [scope]\nCannot commit to [limits without approval]\nRules: Always require human approval for [actions]`}
            />
            <p className="text-xs text-[#94a3b8]">Optional — you can skip this step.</p>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a] tracking-tight">Step 3 — Your Agent's Capability File</h2>
            <p className="text-sm text-[#64748b]">Defines what your agent can do and what it will share with other agents.</p>
            <textarea
              value={form.skill_md}
              onChange={update('skill_md')}
              rows={10}
              className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200 resize-none"
              placeholder={`# Agent Capabilities\nCan share: [what you will share]\nCannot share: [what stays private]\nRequires human approval for: [list actions]\nAvailable for: [types of connections]`}
            />
            <p className="text-xs text-[#94a3b8]">Optional — you can skip this step.</p>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#0f172a] tracking-tight">Step 4 — Review & Launch</h2>
            <div className="bg-[#f5f3ee] rounded-xl p-5 space-y-3">
              <div className="flex justify-between py-2 border-b border-[#e2e8f0]">
                <span className="text-sm text-[#64748b]">Agent Name</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.agent_name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#e2e8f0]">
                <span className="text-sm text-[#64748b]">Company</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.company}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#e2e8f0]">
                <span className="text-sm text-[#64748b]">Type</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.agent_type}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#e2e8f0]">
                <span className="text-sm text-[#64748b]">Platform</span>
                <span className="text-sm font-medium text-[#0f172a]">{form.llm_platform}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-[#64748b]">API Key</span>
                <span className="text-sm font-medium text-[#0f172a] font-mono">{form.llm_api_key.slice(0, 8)}{'*'.repeat(12)}</span>
              </div>
              {form.user_email && (
                <div className="flex justify-between py-2 border-t border-[#e2e8f0]">
                  <span className="text-sm text-[#64748b]">Notification Email</span>
                  <span className="text-sm font-medium text-[#0f172a]">{form.user_email}</span>
                </div>
              )}
            </div>
            <div className="flex justify-center py-6">
              <div className="bg-white rounded-xl p-6 inline-block shadow-sm border border-[#e2e8f0]">
                <QRCode value={previewUrl} size={160} />
                <p className="text-xs text-[#94a3b8] mt-3 text-center">QR preview — final code generated on launch</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button onClick={back} className="bg-[#f5f3ee] hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200">
              Back
            </button>
          ) : <div />}
          {step < 4 ? (
            <button onClick={next} className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200">
              Next
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={loading}
              className="bg-[#2d6b4a] hover:bg-[#245a3e] text-white rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-all duration-200"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Launch My Agent
            </button>
          )}
        </div>
      </div>
    </Layout>
  )
}
