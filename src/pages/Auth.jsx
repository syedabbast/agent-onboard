import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getMyAgents } from '../lib/supabase'
import toast from 'react-hot-toast'

const errorMap = {
  'Invalid login credentials': 'Email or password is incorrect',
  'User already registered': 'An account with this email already exists',
  'Password should be at least 6 characters': 'Password must be at least 8 characters',
}

function humanError(msg) {
  return errorMap[msg] || msg
}

export default function Auth() {
  const [tab, setTab] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(humanError(error.message))
      setLoading(false)
      return
    }
    const { data: agents } = await getMyAgents(data.user.id)
    if (agents && agents.length > 0) {
      navigate('/')
    } else {
      navigate('/register')
    }
    setLoading(false)
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      toast.error(humanError(error.message))
      setLoading(false)
      return
    }
    toast.success('Account created!')
    navigate('/register')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#fffef9] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-[#2d6b4a]" />
            <span className="font-serif font-semibold text-[#0f172a] text-3xl tracking-tight">Agent OnBoard</span>
          </div>
          <p className="text-sm text-[#94a3b8]">by Auwire Technologies</p>
          <p className="text-[#64748b] mt-3 text-base">The secure handshake between AI agents</p>
        </div>

        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm">
          <div className="flex mb-8">
            <button
              onClick={() => setTab('signin')}
              className={`flex-1 pb-3 text-sm font-medium transition-all duration-200 ${tab === 'signin' ? 'text-[#f59e0b] border-b-2 border-[#f59e0b]' : 'text-[#94a3b8] border-b border-transparent hover:text-[#64748b]'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab('signup')}
              className={`flex-1 pb-3 text-sm font-medium transition-all duration-200 ${tab === 'signup' ? 'text-[#f59e0b] border-b-2 border-[#f59e0b]' : 'text-[#94a3b8] border-b border-transparent hover:text-[#64748b]'}`}
            >
              Sign Up
            </button>
          </div>

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200"
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0f172a] mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-[#f5f3ee] border-0 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/30 transition-all duration-200"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0a1628] hover:bg-[#1e3a5f] text-white rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200"
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Create Account
              </button>
            </form>
          )}
        </div>

        {/* Directory link for non-authenticated users */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/directory')}
            className="text-sm text-[#0ea5e9] hover:bg-[#0ea5e9]/5 rounded-lg px-5 py-2.5 transition-all duration-200"
          >
            Browse Agent Directory
          </button>
        </div>
      </div>
    </div>
  )
}
