import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getMyAgents } from '../lib/supabase'

export default function Layout({ children, activeAgentName }) {
  const [email, setEmail] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setEmail(data.user.email)
    })
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen bg-[#fffef9]">
      <nav className="sticky top-0 z-50 bg-white border-b border-[#e2e8f0]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
            <span className="font-serif font-semibold text-[#0f172a] text-lg tracking-tight cursor-pointer transition-opacity hover:opacity-70" onClick={() => navigate('/')}>Agent OnBoard</span>
            <span className="text-sm text-[#94a3b8]">by Auwire Technologies</span>
            {activeAgentName && (
              <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#fef3c7] text-[#92400e]">
                {activeAgentName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/directory')}
              className="text-sm text-[#64748b] hover:text-[#0a1628] font-medium transition-colors duration-200"
            >
              Directory
            </button>
            <span className="text-sm text-[#94a3b8]">{email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-[#64748b] hover:text-[#0f172a] border border-[#e2e8f0] rounded-lg px-4 py-1.5 hover:bg-[#f5f3ee] transition-all duration-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
