import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Layout({ children }) {
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
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
          <span className="font-bold text-[#0f172a] text-lg">Agent OnBoard</span>
          <span className="text-sm text-[#64748b]">by Auwire Technologies</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#64748b]">{email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-[#64748b] hover:text-[#0f172a] border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
