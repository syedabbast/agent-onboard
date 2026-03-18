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

export async function uploadDocument(agentId, file) {
  const filePath = `${agentId}/${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage
    .from('agent-documents')
    .upload(filePath, file)
  if (error) return { data: null, error }

  // Save metadata to agent_documents table
  const { data: doc, error: docError } = await supabase
    .from('agent_documents')
    .insert({
      agent_id: agentId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type,
      status: 'processing'
    })
    .select()
    .single()

  return { data: doc, error: docError }
}

export async function getAgentDocuments(agentId) {
  const { data, error } = await supabase
    .from('agent_documents')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function deleteDocument(docId, filePath) {
  await supabase.storage.from('agent-documents').remove([filePath])
  const { error } = await supabase
    .from('agent_documents')
    .delete()
    .eq('id', docId)
  return { error }
}

export async function getDocumentContent(filePath) {
  const { data, error } = await supabase.storage
    .from('agent-documents')
    .download(filePath)
  if (error) return { content: null, error }
  const text = await data.text()
  return { content: text, error: null }
}

export async function getAgentKnowledge(agentId) {
  // Get all documents for an agent and combine their content
  const { data: docs } = await supabase
    .from('agent_documents')
    .select('*')
    .eq('agent_id', agentId)
    .eq('status', 'ready')

  if (!docs || docs.length === 0) return ''

  let knowledge = ''
  for (const doc of docs) {
    const { content } = await getDocumentContent(doc.file_path)
    if (content) {
      knowledge += `\n\n--- DOCUMENT: ${doc.file_name} ---\n${content}`
    }
  }
  return knowledge
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
