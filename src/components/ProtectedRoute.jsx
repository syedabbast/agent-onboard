import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, getMyAgent } from '../lib/supabase'
import Spinner from './Spinner'

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let mounted = true

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/auth')
        return
      }
      const { data: agent } = await getMyAgent(session.user.id)
      if (!mounted) return
      if (!agent && !location.pathname.startsWith('/register')) {
        navigate('/register')
        return
      }
      setAllowed(true)
      setLoading(false)
    }

    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        navigate('/auth')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [navigate, location.pathname])

  if (loading && !allowed) return <Spinner />
  return allowed ? children : null
}
