// ═══════════════════════════════════════════════════
// API Key Security — Agent OnBoard by Auwire Technologies
// ═══════════════════════════════════════════════════

// --- ENCRYPTION (AES-like XOR + salt + double base64) ---

export function encryptKey(apiKey, userId) {
  if (!apiKey || !userId) return null
  const salt = userId.split('').reverse().join('') + 'auwire_onboard_2026'
  const round1 = apiKey.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length))
  ).join('')
  const round2 = btoa(round1).split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ userId.charCodeAt(i % userId.length))
  ).join('')
  return btoa(round2)
}

export function decryptKey(encrypted, userId) {
  if (!encrypted || !userId) return null
  try {
    const round2 = atob(encrypted)
    const round1decoded = round2.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ userId.charCodeAt(i % userId.length))
    ).join('')
    const decoded = atob(round1decoded)
    const salt = userId.split('').reverse().join('') + 'auwire_onboard_2026'
    return decoded.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length))
    ).join('')
  } catch {
    return null
  }
}

// --- KEY MASKING ---

export function maskKey(apiKey) {
  if (!apiKey) return ''
  if (apiKey.length < 12) return '••••••••••'
  return apiKey.slice(0, 7) + '••••••••••••••••' + apiKey.slice(-4)
}

// --- KEY VALIDATION ---

export function validateKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return { valid: false, error: 'API key is required' }
  const trimmed = apiKey.trim()
  if (trimmed.length < 10) return { valid: false, error: 'API key is too short' }
  if (trimmed.length > 500) return { valid: false, error: 'API key is too long' }
  if (/\s/.test(trimmed)) return { valid: false, error: 'API key must not contain spaces' }
  if (trimmed.includes('<') || trimmed.includes('>') || trimmed.includes('"')) return { valid: false, error: 'API key contains invalid characters' }
  return { valid: true, error: null }
}

// --- PLATFORM DETECTION ---

export function detectPlatform(apiKey) {
  if (!apiKey) return null
  const key = apiKey.trim()
  // Anthropic / Claude
  if (key.startsWith('sk-ant-')) return 'claude'
  // OpenAI
  if (key.startsWith('sk-proj-') || key.startsWith('sk-org-') || (key.startsWith('sk-') && !key.startsWith('sk-ant-'))) return 'openai'
  // Google Gemini / AI Studio
  if (key.startsWith('AIza')) return 'gemini'
  // Mistral
  if (key.startsWith('mis-') || key.startsWith('MISTRAL')) return 'mistral'
  // Cohere
  if (key.startsWith('co-') || key.startsWith('COHERE')) return 'cohere'
  // Perplexity
  if (key.startsWith('pplx-')) return 'perplexity'
  // Together AI
  if (key.startsWith('tog-') || key.length === 64) return 'together'
  // Groq
  if (key.startsWith('gsk_')) return 'groq'
  // Fireworks AI
  if (key.startsWith('fw_')) return 'fireworks'
  // DeepSeek
  if (key.startsWith('sk-') && key.length > 50) return 'deepseek'
  // xAI (Grok)
  if (key.startsWith('xai-')) return 'xai'
  // AWS Bedrock (not a key but an identifier)
  if (key.startsWith('AKIA')) return 'bedrock'
  // Azure OpenAI
  if (key.length === 32 && /^[a-f0-9]+$/.test(key)) return 'azure'
  // Replicate
  if (key.startsWith('r8_')) return 'replicate'
  // Hugging Face
  if (key.startsWith('hf_')) return 'huggingface'
  // OpenRouter
  if (key.startsWith('sk-or-')) return 'openrouter'
  return 'other'
}

export function getPlatformLabel(platform) {
  const labels = {
    claude: 'Claude (Anthropic)',
    openai: 'OpenAI (GPT)',
    gemini: 'Google Gemini',
    mistral: 'Mistral AI',
    cohere: 'Cohere',
    perplexity: 'Perplexity AI',
    together: 'Together AI',
    groq: 'Groq',
    fireworks: 'Fireworks AI',
    deepseek: 'DeepSeek',
    xai: 'xAI (Grok)',
    bedrock: 'AWS Bedrock',
    azure: 'Azure OpenAI',
    replicate: 'Replicate',
    huggingface: 'Hugging Face',
    openrouter: 'OpenRouter',
    other: 'Other / Custom'
  }
  return labels[platform] || 'Unknown'
}

export function getPlatformColor(platform) {
  const colors = {
    claude: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
    openai: { bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
    gemini: { bg: 'bg-blue-500/10', text: 'text-blue-600' },
    mistral: { bg: 'bg-orange-500/10', text: 'text-orange-600' },
    cohere: { bg: 'bg-purple-500/10', text: 'text-purple-600' },
    perplexity: { bg: 'bg-cyan-500/10', text: 'text-cyan-600' },
    together: { bg: 'bg-indigo-500/10', text: 'text-indigo-600' },
    groq: { bg: 'bg-red-500/10', text: 'text-red-600' },
    fireworks: { bg: 'bg-yellow-500/10', text: 'text-yellow-600' },
    deepseek: { bg: 'bg-sky-500/10', text: 'text-sky-600' },
    xai: { bg: 'bg-gray-500/10', text: 'text-gray-600' },
    bedrock: { bg: 'bg-orange-500/10', text: 'text-orange-700' },
    azure: { bg: 'bg-blue-500/10', text: 'text-blue-700' },
    replicate: { bg: 'bg-pink-500/10', text: 'text-pink-600' },
    huggingface: { bg: 'bg-yellow-500/10', text: 'text-yellow-700' },
    openrouter: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
    other: { bg: 'bg-gray-500/10', text: 'text-gray-600' },
  }
  return colors[platform] || colors.other
}

// --- MODEL CATALOG ---

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
      { id: 'gpt-4.1', name: 'GPT-4.1', note: 'Latest' },
      { id: 'o3-mini', name: 'o3-mini', note: 'Reasoning model' },
    ],
    gemini: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', note: 'Recommended' },
      { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro', note: 'Most powerful' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', note: 'Stable' },
    ],
    mistral: [
      { id: 'mistral-large-latest', name: 'Mistral Large', note: 'Most powerful' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', note: 'Recommended' },
      { id: 'mistral-small-latest', name: 'Mistral Small', note: 'Fast, cheap' },
      { id: 'codestral-latest', name: 'Codestral', note: 'Code specialist' },
    ],
    cohere: [
      { id: 'command-r-plus', name: 'Command R+', note: 'Most powerful' },
      { id: 'command-r', name: 'Command R', note: 'Recommended' },
      { id: 'command-light', name: 'Command Light', note: 'Fast, cheap' },
    ],
    perplexity: [
      { id: 'sonar-pro', name: 'Sonar Pro', note: 'With search, powerful' },
      { id: 'sonar', name: 'Sonar', note: 'With search, recommended' },
    ],
    together: [
      { id: 'meta-llama/Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B', note: 'Most powerful open' },
      { id: 'meta-llama/Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', note: 'Recommended' },
      { id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B', note: 'Fast, cheapest' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', note: 'Strong multilingual' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', note: 'Via Together' },
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', note: 'Recommended, ultra-fast' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', note: 'Fastest' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', note: 'Good balance' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', note: 'Google open model' },
    ],
    fireworks: [
      { id: 'accounts/fireworks/models/llama-v3p1-405b-instruct', name: 'Llama 3.1 405B', note: 'Most powerful' },
      { id: 'accounts/fireworks/models/llama-v3p1-70b-instruct', name: 'Llama 3.1 70B', note: 'Recommended' },
      { id: 'accounts/fireworks/models/mixtral-8x22b-instruct', name: 'Mixtral 8x22B', note: 'Mistral via Fireworks' },
    ],
    deepseek: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', note: 'Recommended' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', note: 'Reasoning model' },
    ],
    xai: [
      { id: 'grok-3', name: 'Grok 3', note: 'Most powerful' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', note: 'Fast, cheaper' },
    ],
    bedrock: [
      { id: 'anthropic.claude-sonnet-4-20250514-v1:0', name: 'Claude Sonnet 4 (Bedrock)', note: 'Via AWS' },
      { id: 'anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5 (Bedrock)', note: 'Via AWS' },
      { id: 'meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B (Bedrock)', note: 'Via AWS' },
    ],
    azure: [
      { id: 'gpt-4o', name: 'GPT-4o (Azure)', note: 'Via Azure' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Azure)', note: 'Via Azure, cheaper' },
    ],
    replicate: [
      { id: 'meta/meta-llama-3.1-405b-instruct', name: 'Llama 3.1 405B', note: 'Via Replicate' },
      { id: 'meta/meta-llama-3.1-70b-instruct', name: 'Llama 3.1 70B', note: 'Via Replicate' },
    ],
    huggingface: [
      { id: 'meta-llama/Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', note: 'Via HF Inference' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', note: 'Via HF Inference' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', note: 'Via HF Inference' },
    ],
    openrouter: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', note: 'Via OpenRouter' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', note: 'Via OpenRouter' },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', note: 'Via OpenRouter' },
      { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', note: 'Via OpenRouter' },
      { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', note: 'Via OpenRouter' },
    ],
    other: [
      { id: 'custom', name: 'Custom Model', note: 'OpenAI-compatible API' },
    ],
  }
  return models[platform] || models.other
}

// --- COST ESTIMATES ---

export function getCostEstimate(model) {
  const costs = {
    // Claude
    'claude-haiku-4-5-20251001': '~$0.001 per message',
    'claude-sonnet-4-20250514': '~$0.003 per message',
    'claude-opus-4-6': '~$0.015 per message',
    // OpenAI
    'gpt-4o-mini': '~$0.0002 per message',
    'gpt-4o': '~$0.005 per message',
    'gpt-4-turbo': '~$0.01 per message',
    'gpt-4.1': '~$0.005 per message',
    'o3-mini': '~$0.002 per message',
    // Gemini
    'gemini-2.0-flash': '~$0.0001 per message',
    'gemini-2.5-pro-preview-06-05': '~$0.005 per message',
    'gemini-1.5-pro': '~$0.002 per message',
    // Mistral
    'mistral-large-latest': '~$0.008 per message',
    'mistral-medium-latest': '~$0.003 per message',
    'mistral-small-latest': '~$0.001 per message',
    'codestral-latest': '~$0.003 per message',
    // Cohere
    'command-r-plus': '~$0.003 per message',
    'command-r': '~$0.001 per message',
    'command-light': '~$0.0003 per message',
    // Perplexity
    'sonar-pro': '~$0.005 per message',
    'sonar': '~$0.001 per message',
    // Groq (free tier available)
    'llama-3.3-70b-versatile': '~$0.0006 per message',
    'llama-3.1-8b-instant': '~$0.0001 per message',
    'mixtral-8x7b-32768': '~$0.0003 per message',
    'gemma2-9b-it': '~$0.0002 per message',
    // DeepSeek
    'deepseek-chat': '~$0.0003 per message',
    'deepseek-reasoner': '~$0.002 per message',
    // xAI
    'grok-3': '~$0.01 per message',
    'grok-3-mini': '~$0.003 per message',
  }
  return costs[model] || 'Varies by provider'
}

// --- PLATFORM → PROXY MAPPING ---
// Maps detected platform to the proxy server's expected platform name

export function getPlatformForProxy(platform) {
  const map = {
    claude: 'Claude (Anthropic)',
    openai: 'OpenAI (GPT)',
    gemini: 'Google Gemini',
    mistral: 'Mistral AI',
    cohere: 'Cohere',
    perplexity: 'Perplexity AI',
    together: 'Together AI',
    groq: 'Groq',
    fireworks: 'Fireworks AI',
    deepseek: 'DeepSeek',
    xai: 'xAI (Grok)',
    bedrock: 'AWS Bedrock',
    azure: 'Azure OpenAI',
    replicate: 'Replicate',
    huggingface: 'Hugging Face',
    openrouter: 'OpenRouter',
    other: 'Other',
  }
  return map[platform] || 'Other'
}
