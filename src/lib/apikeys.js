export function encryptKey(apiKey, userId) {
  const encoded = btoa(
    apiKey.split('').map((c, i) =>
      String.fromCharCode(
        c.charCodeAt(0) ^
        userId.charCodeAt(i % userId.length)
      )
    ).join('')
  )
  return encoded
}

export function decryptKey(encrypted, userId) {
  try {
    const decoded = atob(encrypted)
    return decoded.split('').map((c, i) =>
      String.fromCharCode(
        c.charCodeAt(0) ^
        userId.charCodeAt(i % userId.length)
      )
    ).join('')
  } catch {
    return null
  }
}

export function maskKey(apiKey) {
  if (!apiKey) return ''
  if (apiKey.length < 12) return '••••••••••'
  return apiKey.slice(0, 7) + '••••••••••••' + apiKey.slice(-4)
}

export function detectPlatform(apiKey) {
  if (!apiKey) return null
  if (apiKey.startsWith('sk-ant-')) return 'claude'
  if (apiKey.startsWith('sk-')) return 'openai'
  if (apiKey.startsWith('AIza')) return 'gemini'
  return 'other'
}

export function getPlatformLabel(platform) {
  const labels = {
    claude: 'Claude (Anthropic)',
    openai: 'OpenAI (GPT)',
    gemini: 'Google Gemini',
    other: 'Other'
  }
  return labels[platform] || 'Unknown'
}

export function getModelsForPlatform(platform) {
  const models = {
    claude: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', note: 'Recommended' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', note: 'Faster, cheaper' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', note: 'Most powerful' },
    ],
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', note: 'Recommended, cheapest' },
      { id: 'gpt-4o', name: 'GPT-4o', note: 'More powerful' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', note: 'Legacy' },
    ],
    gemini: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', note: 'Recommended' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', note: 'More powerful' },
    ],
    other: [
      { id: 'gpt-4o-mini', name: 'Default', note: 'OpenAI-compatible' },
    ],
  }
  return models[platform] || models.other
}

export function getCostEstimate(model) {
  const costs = {
    'claude-haiku-4-5-20251001': '~$0.001 per message',
    'claude-sonnet-4-20250514': '~$0.003 per message',
    'claude-opus-4-6': '~$0.015 per message',
    'gpt-4o-mini': '~$0.0002 per message',
    'gpt-4o': '~$0.005 per message',
    'gpt-4-turbo': '~$0.01 per message',
    'gemini-2.0-flash': '~$0.0001 per message',
    'gemini-1.5-pro': '~$0.002 per message',
  }
  return costs[model] || '~$0.003 per message'
}
