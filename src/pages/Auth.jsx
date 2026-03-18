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

// Inline SVG components for the auth page graphics
function PlaneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  )
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function QrIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zm4 0h3v3h-3zm-4 4h3v3h-3zm4 0h3v3h-3z" />
    </svg>
  )
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
    <div className="min-h-screen bg-[#fffef9] relative overflow-hidden">
      {/* Background dot grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#0a1628 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      {/* Decorative floating planes */}
      <div className="absolute top-[15%] left-[8%] text-[#f59e0b]/10 animate-pulse hidden lg:block">
        <PlaneIcon className="w-20 h-20 -rotate-12" />
      </div>
      <div className="absolute top-[25%] right-[10%] text-[#0ea5e9]/10 hidden lg:block" style={{ animation: 'pulse 3s infinite 1s' }}>
        <PlaneIcon className="w-14 h-14 rotate-45" />
      </div>
      <div className="absolute bottom-[20%] left-[12%] text-[#2d6b4a]/10 hidden lg:block" style={{ animation: 'pulse 4s infinite 0.5s' }}>
        <ShieldIcon className="w-16 h-16" />
      </div>
      <div className="absolute bottom-[30%] right-[8%] text-[#f59e0b]/10 hidden lg:block" style={{ animation: 'pulse 3.5s infinite 2s' }}>
        <QrIcon className="w-12 h-12" />
      </div>

      {/* Decorative dashed flight path */}
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.04] hidden lg:block" viewBox="0 0 1200 800">
        <path d="M-50,400 Q300,100 600,350 T1250,200" fill="none" stroke="#0a1628" strokeWidth="2" strokeDasharray="8 8" />
        <path d="M-50,600 Q400,300 700,500 T1250,350" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 6" />
      </svg>

      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-[440px]">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#0a1628] flex items-center justify-center">
                <PlaneIcon className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <span className="font-serif font-semibold text-[#0f172a] text-3xl tracking-tight">Agent OnBoard</span>
            </div>
            <p className="text-sm text-[#94a3b8] mb-3">by Auwire Technologies</p>
            <p className="text-[#64748b] text-base">Your agent. Onboard.</p>
          </div>

          {/* Mini departure board */}
          <div className="bg-[#0a1628] rounded-xl p-4 mb-6 font-mono text-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#f59e0b] font-semibold tracking-wider">AGENT ONBOARD</span>
              <span className="flex items-center gap-1.5 text-[#2d6b4a]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2d6b4a] animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="flex justify-between text-white/40">
                <span className="w-1/3">AGENT</span>
                <span className="w-1/3 text-center">DESTINATION</span>
                <span className="w-1/3 text-right">STATUS</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span className="w-1/3">TAHLEEL AI</span>
                <span className="w-1/3 text-center">SPORTSCORP</span>
                <span className="w-1/3 text-right text-[#2d6b4a]">IN FLIGHT ✈</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span className="w-1/3">RH RECRUIT</span>
                <span className="w-1/3 text-center">TECHCORP</span>
                <span className="w-1/3 text-right text-[#f59e0b]">BOARDING ⚡</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span className="w-1/3">LEGAL BOT</span>
                <span className="w-1/3 text-center">COURT SYS</span>
                <span className="w-1/3 text-right text-[#0ea5e9]">CONNECTED ✓</span>
              </div>
            </div>
            <div className="border-t border-white/10 mt-3 pt-2 text-white/30 text-center">
              Agents in flight: 847 · Owners: 623
            </div>
          </div>

          {/* Auth card */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm relative">
            {/* Corner boarding pass decoration */}
            <div className="absolute -top-3 -right-3 bg-[#fef3c7] text-[#92400e] text-[10px] font-mono px-2.5 py-1 rounded-lg border border-[#f59e0b]/20 rotate-3 shadow-sm">
              ✈ BOARDING PASS
            </div>

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
                  <PlaneIcon className="w-4 h-4" />
                  Board Now
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
                  Get Your Boarding Pass
                </button>
              </form>
            )}

            {/* Perforated edge */}
            <div className="mt-6 pt-5 border-t border-dashed border-[#e2e8f0]">
              <div className="flex items-center justify-center gap-6 text-xs text-[#94a3b8]">
                <span className="flex items-center gap-1.5"><PlaneIcon className="w-3.5 h-3.5 text-[#0ea5e9]" /> Any AI platform</span>
                <span className="flex items-center gap-1.5"><ShieldIcon className="w-3.5 h-3.5 text-[#2d6b4a]" /> Fully secure</span>
                <span className="flex items-center gap-1.5"><QrIcon className="w-3.5 h-3.5 text-[#f59e0b]" /> QR connect</span>
              </div>
            </div>
          </div>

          {/* Bottom links */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => navigate('/directory')}
              className="text-sm text-[#0ea5e9] hover:bg-[#0ea5e9]/5 rounded-lg px-4 py-2 transition-all duration-200"
            >
              Browse Agent Directory
            </button>
            <span className="text-[#e2e8f0]">|</span>
            <a
              href="/landing.html"
              className="text-sm text-[#64748b] hover:text-[#0f172a] rounded-lg px-4 py-2 transition-all duration-200"
            >
              Learn More
            </a>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-[#94a3b8] mt-8">
            © 2026 Auwire Technologies · auwiretech.com
          </p>
        </div>
      </div>
    </div>
  )
}
