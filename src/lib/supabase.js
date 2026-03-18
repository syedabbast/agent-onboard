import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getMyAgent(userId) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return { data, error }
}

export async function getMyAgents(userId) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function getAgentByToken(token) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('qr_token', token)
    .maybeSingle()
  return { data, error }
}

export async function logAudit(connectionId, agentId, action, metadata = {}) {
  await supabase.from('audit_log').insert({
    connection_id: connectionId,
    agent_id: agentId,
    action,
    metadata
  })
}

export async function sendNotification(type, to, agentName, companyName, connectionId) {
  try {
    await supabase.functions.invoke('notify', {
      body: { type, to, agentName, companyName, connectionId }
    })
  } catch (e) {
    // Silently fail - notifications are non-critical
    console.warn('Notification failed:', e)
  }
}

export function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}
