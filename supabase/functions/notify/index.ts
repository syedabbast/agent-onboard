import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'Agent OnBoard <notifications@auwiretech.com>'
const APP_URL = Deno.env.get('APP_URL') || 'https://agentonboard.com'

interface NotificationPayload {
  type: 'connection_request' | 'connection_approved' | 'new_message'
  to: string
  agentName: string
  companyName: string
  connectionId: string
}

function getSubject(type: string, agentName: string): string {
  switch (type) {
    case 'connection_request':
      return `New connection request from ${agentName}`
    case 'connection_approved':
      return `${agentName} approved your connection`
    case 'new_message':
      return `New message from ${agentName}`
    default:
      return `Agent OnBoard Notification`
  }
}

function getHtml(type: string, agentName: string, companyName: string, connectionId: string): string {
  const sessionUrl = `${APP_URL}/session/${connectionId}`

  const header = `
    <div style="background-color: #1a4d8f; padding: 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 20px;">Agent OnBoard</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0 0; font-size: 12px;">by Auwire Technologies</p>
    </div>
  `

  const footer = `
    <div style="padding: 20px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
      <p>Secured by Agent OnBoard &mdash; auwiretech.com</p>
      <p>All messages are logged and auditable</p>
    </div>
  `

  let body = ''

  switch (type) {
    case 'connection_request':
      body = `
        <div style="padding: 30px;">
          <h2 style="color: #0f172a; margin: 0 0 10px 0;">New Connection Request</h2>
          <p style="color: #64748b; margin: 0 0 20px 0;">
            <strong>${agentName}</strong> from <strong>${companyName}</strong> wants to connect with your agent.
          </p>
          <a href="${sessionUrl}" style="display: inline-block; background-color: #1a4d8f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            Review Request
          </a>
        </div>
      `
      break
    case 'connection_approved':
      body = `
        <div style="padding: 30px;">
          <h2 style="color: #0f172a; margin: 0 0 10px 0;">Connection Approved</h2>
          <p style="color: #64748b; margin: 0 0 20px 0;">
            <strong>${agentName}</strong> from <strong>${companyName}</strong> has approved your connection request. You can now start a session.
          </p>
          <a href="${sessionUrl}" style="display: inline-block; background-color: #2d6b4a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            Open Session
          </a>
        </div>
      `
      break
    case 'new_message':
      body = `
        <div style="padding: 30px;">
          <h2 style="color: #0f172a; margin: 0 0 10px 0;">New Message</h2>
          <p style="color: #64748b; margin: 0 0 20px 0;">
            <strong>${agentName}</strong> from <strong>${companyName}</strong> sent a new message in your session.
          </p>
          <a href="${sessionUrl}" style="display: inline-block; background-color: #1a4d8f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            View Message
          </a>
        </div>
      `
      break
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      ${header}
      ${body}
      ${footer}
    </div>
  `
}

serve(async (req) => {
  try {
    const { type, to, agentName, companyName, connectionId } = (await req.json()) as NotificationPayload

    if (!to || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured, skipping email')
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: getSubject(type, agentName),
        html: getHtml(type, agentName, companyName, connectionId),
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return new Response(JSON.stringify({ error: 'Email send failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Notification error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
