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
