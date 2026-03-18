import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  encryptKey,
  maskKey,
  detectPlatform,
  getPlatformLabel,
  getModelsForPlatform,
  getCostEstimate,
} from '../lib/apikeys'
import toast from 'react-hot-toast'
import { Bot, Lock, Shield } from 'lucide-react'

const platformBadgeColors = {
  claude: 'bg-[#fef3c7] text-[#92400e]',
  openai: 'bg-[#edf5f0] text-[#2d6b4a]',
  gemini: 'bg-[#0ea5e9]/10 text-[#0ea5e9]',
  other: 'bg-[#f5f3ee] text-[#64748b]',
}

export default function ApiKeySettings({ agent, onUpdate }) {
  const [apiKey, setApiKey] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [userId, setUserId] = useState(null)
  const [selectedModel, setSelectedModel] = useState(agent?.llm_model || '')
  const [autoRespond, setAutoRespond] = useState(false)

  const hasKey = !!agent?.llm_api_key
  const detectedPlatform = hasKey ? detectPlatform(agent.llm_api_key) : null
  const models = detectedPlatform ? getModelsForPlatform(detectedPlatform) : []

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
    }
    loadUser()
  }, [])

  useEffect(() => {
    if (agent?.llm_model) {
      setSelectedModel(agent.llm_model)
    } else if (models.length > 0) {
      setSelectedModel(models[0].id)
    }
  }, [agent?.llm_model, detectedPlatform])

  useEffect(() => {
    // Initialize auto-respond from localStorage (existing behavior)
    if (agent?.id) {
      const isAuto = localStorage.getItem(`llm_auto_${agent.id}`) === 'true'
      setAutoRespond(isAuto)
    }
  }, [agent?.id])

  const toggleAutoRespond = () => {
    const key = `llm_auto_${agent.id}`
    const newValue = !autoRespond
    localStorage.setItem(key, newValue.toString())
    setAutoRespond(newValue)
    toast.success(newValue ? 'Auto-respond enabled' : 'Auto-respond disabled')
    onUpdate?.()
  }

  const saveKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key')
      return
    }
    if (!userId) {
      toast.error('Not authenticated')
      return
    }

    setSaving(true)
    const platform = detectPlatform(apiKey.trim())
    const platformLabel = getPlatformLabel(platform)
    const encrypted = encryptKey(apiKey.trim(), userId)
    const defaultModel = getModelsForPlatform(platform)[0]?.id || ''

    const { error } = await supabase
      .from('agents')
      .update({
        llm_api_key: apiKey.trim(),
        llm_api_key_encrypted: encrypted,
        llm_platform: platformLabel,
        llm_model: defaultModel,
      })
      .eq('id', agent.id)

    if (error) {
      toast.error('Failed to save API key: ' + error.message)
    } else {
      toast.success(`API key saved. Your agent will auto-respond using your ${platformLabel} account.`)
      setApiKey('')
      setEditing(false)
      setSelectedModel(defaultModel)
    }
    setSaving(false)
    onUpdate?.()
  }

  const removeKey = async () => {
    setRemoving(true)
    const { error } = await supabase
      .from('agents')
      .update({
        llm_api_key: null,
        llm_api_key_encrypted: null,
        llm_platform: null,
        llm_model: null,
      })
      .eq('id', agent.id)

    if (error) {
      toast.error('Failed to remove API key: ' + error.message)
    } else {
      toast.success('API key removed')
      localStorage.removeItem(`llm_auto_${agent.id}`)
      setAutoRespond(false)
      setEditing(false)
    }
    setRemoving(false)
    onUpdate?.()
  }

  const saveModel = async (modelId) => {
    setSelectedModel(modelId)
    const { error } = await supabase
      .from('agents')
      .update({ llm_model: modelId })
      .eq('id', agent.id)

    if (error) {
      toast.error('Failed to save model selection')
    } else {
      toast.success('Model updated')
    }
    onUpdate?.()
  }

  return (
    <div className="space-y-4">
      {/* Auto-Respond Toggle */}
      {hasKey && (
        <div className="bg-[#f5f3ee] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#64748b]" />
              <span className="text-sm font-medium text-[#0f172a]">Auto-Respond</span>
            </div>
            <button
              onClick={toggleAutoRespond}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                autoRespond ? 'bg-[#0a1628]' : 'bg-[#e2e8f0]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  autoRespond ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-[#94a3b8] mt-2">
            Your agent responds automatically using your own API key. You pay your provider directly.
          </p>
        </div>
      )}

      {/* API Key Section */}
      <div className="bg-[#f5f3ee] rounded-xl p-4">
        <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-3">API Key</p>

        {hasKey && !editing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm font-mono text-[#0f172a] bg-white rounded-lg px-3 py-1.5 flex-1 min-w-0 truncate">
                {maskKey(agent.llm_api_key)}
              </code>
              {detectedPlatform && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${platformBadgeColors[detectedPlatform] || platformBadgeColors.other}`}>
                  {getPlatformLabel(detectedPlatform)}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="bg-white hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200"
              >
                Update Key
              </button>
              <button
                onClick={removeKey}
                disabled={removing}
                className="text-[#ff3b30] hover:bg-[#ff3b30]/5 rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50"
              >
                {removing ? 'Removing...' : 'Remove Key'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-white border-0 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
              placeholder="sk-ant-... or sk-..."
            />
            <div className="flex gap-2">
              <button
                onClick={saveKey}
                disabled={saving || !apiKey.trim()}
                className="bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Key'}
              </button>
              {hasKey && (
                <button
                  onClick={() => { setEditing(false); setApiKey('') }}
                  className="bg-white hover:bg-[#e8e5de] text-[#0f172a] rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Model Selection */}
      {hasKey && models.length > 0 && (
        <div className="bg-[#f5f3ee] rounded-xl p-4">
          <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-3">Model</p>
          <select
            value={selectedModel}
            onChange={(e) => saveModel(e.target.value)}
            className="w-full bg-white border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.note}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Cost Estimate */}
      {hasKey && selectedModel && (
        <div className="bg-[#0ea5e9]/5 rounded-xl p-4">
          <p className="text-sm font-medium text-[#0ea5e9] mb-1">
            Estimated cost: {getCostEstimate(selectedModel)}
          </p>
          <p className="text-xs text-[#0ea5e9]/70">
            Billed directly to your {getPlatformLabel(detectedPlatform)} account. Agent OnBoard never sees your usage or bill.
          </p>
        </div>
      )}

      {/* Privacy Note */}
      <div className="bg-[#edf5f0] border border-[#2d6b4a]/20 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-[#2d6b4a] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[#2d6b4a]/90 leading-relaxed">
            Your API key is encrypted and stored only for your agent. Agent OnBoard staff cannot read it. It is never shared with other agents or users. You can remove it at any time.
          </p>
        </div>
      </div>
    </div>
  )
}
