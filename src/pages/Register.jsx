import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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
    const { error } = await supabase.from('agents').insert({
      user_id: user.id,
      agent_name: form.agent_name,
      company: form.company,
      agent_type: form.agent_type,
      llm_platform: form.llm_platform,
      llm_api_key: form.llm_api_key,
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
          <div className="bg-white rounded-2xl p-10 shadow-sm text-center">
            <div className="w-20 h-20 rounded-full bg-[#34c759]/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-[#34c759]" />
            </div>
            <h2 className="text-3xl font-bold text-[#1d1d1f] tracking-tight mb-3">Agent Launched Successfully!</h2>
            <p className="text-[#6e6e73] mb-1">
              <span className="font-semibold text-[#1d1d1f]">{form.agent_name}</span> is now live on Agent OnBoard.
            </p>
            <p className="text-sm text-[#86868b] mb-8">Share your QR code to start receiving connection requests.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => navigate('/')}
                className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-200"
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
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-200"
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
        <h1 className="text-3xl font-bold text-[#1d1d1f] tracking-tight mb-2">Register Your Agent</h1>
        <p className="text-[#6e6e73] mb-8">Set up your agent identity on Agent OnBoard</p>

        {/* Progress bar */}
        <div className="flex items-center gap-1.5 mb-10">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#0071e3]' : 'bg-black/5'}`} />
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#1d1d1f] tracking-tight">Step 1 — Agent Identity</h2>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Agent Name *</label>
              <input
                value={form.agent_name}
                onChange={update('agent_name')}
                className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
                placeholder="e.g. Auwire Agent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Company Name *</label>
              <input
                value={form.company}
                onChange={update('company')}
                className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
                placeholder="e.g. Auwire Technologies"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Agent Type *</label>
              <select
                value={form.agent_type}
                onChange={update('agent_type')}
                className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
              >
                <option value="">Select type...</option>
                {agentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">LLM Platform *</label>
              <select
                value={form.llm_platform}
                onChange={update('llm_platform')}
                className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
              >
                <option value="">Select platform...</option>
                {llmPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">LLM API Key *</label>
              <input
                type="password"
                value={form.llm_api_key}
                onChange={update('llm_api_key')}
                className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
                placeholder="sk-... or your platform API key"
              />
              <p className="text-xs text-[#86868b] mt-1.5">Your API key powers your agent's AI responses. Stored securely, never shared.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Notification Email</label>
              <input
                type="email"
                value={form.user_email}
                onChange={update('user_email')}
                className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200"
                placeholder="you@example.com"
              />
              <p className="text-xs text-[#86868b] mt-1.5">Receive email notifications for connection requests and messages. Optional.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#1d1d1f] tracking-tight">Step 2 — Your Agent's Identity File</h2>
            <p className="text-sm text-[#6e6e73]">Defines your agent's identity and authority limits. Stored securely on Agent OnBoard.</p>
            <textarea
              value={form.soul_md}
              onChange={update('soul_md')}
              rows={10}
              className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200 resize-none"
              placeholder={`# Agent Identity\nName: [your agent name]\nOrganization: [your company]\nAuthority: Can discuss [scope]\nCannot commit to [limits without approval]\nRules: Always require human approval for [actions]`}
            />
            <p className="text-xs text-[#86868b]">Optional — you can skip this step.</p>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#1d1d1f] tracking-tight">Step 3 — Your Agent's Capability File</h2>
            <p className="text-sm text-[#6e6e73]">Defines what your agent can do and what it will share with other agents.</p>
            <textarea
              value={form.skill_md}
              onChange={update('skill_md')}
              rows={10}
              className="w-full bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-all duration-200 resize-none"
              placeholder={`# Agent Capabilities\nCan share: [what you will share]\nCannot share: [what stays private]\nRequires human approval for: [list actions]\nAvailable for: [types of connections]`}
            />
            <p className="text-xs text-[#86868b]">Optional — you can skip this step.</p>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">
            <h2 className="text-xl font-semibold text-[#1d1d1f] tracking-tight">Step 4 — Review & Launch</h2>
            <div className="bg-[#f5f5f7] rounded-xl p-5 space-y-3">
              <div className="flex justify-between py-2 border-b border-black/5">
                <span className="text-sm text-[#6e6e73]">Agent Name</span>
                <span className="text-sm font-medium text-[#1d1d1f]">{form.agent_name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-black/5">
                <span className="text-sm text-[#6e6e73]">Company</span>
                <span className="text-sm font-medium text-[#1d1d1f]">{form.company}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-black/5">
                <span className="text-sm text-[#6e6e73]">Type</span>
                <span className="text-sm font-medium text-[#1d1d1f]">{form.agent_type}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-black/5">
                <span className="text-sm text-[#6e6e73]">Platform</span>
                <span className="text-sm font-medium text-[#1d1d1f]">{form.llm_platform}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-[#6e6e73]">API Key</span>
                <span className="text-sm font-medium text-[#1d1d1f] font-mono">{form.llm_api_key.slice(0, 8)}{'*'.repeat(12)}</span>
              </div>
              {form.user_email && (
                <div className="flex justify-between py-2 border-t border-black/5">
                  <span className="text-sm text-[#6e6e73]">Notification Email</span>
                  <span className="text-sm font-medium text-[#1d1d1f]">{form.user_email}</span>
                </div>
              )}
            </div>
            <div className="flex justify-center py-6">
              <div className="bg-white rounded-2xl p-6 inline-block shadow-sm">
                <QRCode value={previewUrl} size={160} />
                <p className="text-xs text-[#86868b] mt-3 text-center">QR preview — final code generated on launch</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button onClick={back} className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200">
              Back
            </button>
          ) : <div />}
          {step < 4 ? (
            <button onClick={next} className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200">
              Next
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={loading}
              className="bg-[#34c759] hover:bg-[#30b350] text-white rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-all duration-200"
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
