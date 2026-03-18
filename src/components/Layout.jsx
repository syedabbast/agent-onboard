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
    <div className="min-h-screen bg-[#f5f5f7]">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#0071e3]" />
            <span className="font-semibold text-[#1d1d1f] text-lg tracking-tight cursor-pointer transition-opacity hover:opacity-70" onClick={() => navigate('/')}>Agent OnBoard</span>
            <span className="text-sm text-[#86868b]">by Auwire Technologies</span>
            {activeAgentName && (
              <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#0071e3]/10 text-[#0071e3]">
                {activeAgentName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/directory')}
              className="text-sm text-[#1d1d1f] hover:text-[#0071e3] font-medium transition-colors duration-200"
            >
              Directory
            </button>
            <span className="text-sm text-[#86868b]">{email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] rounded-full px-4 py-1.5 hover:bg-black/5 transition-all duration-200"
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
