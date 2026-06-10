import { useState, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { generateJoinCode } from '../db/operations'
import { getFamilyId } from '../utils/family'

const CODE_TTL_SECS = 600

export default function InviteCodePanel({ member }) {
  const [code,      setCode]      = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [secsLeft,  setSecsLeft]  = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000))
      setSecsLeft(diff)
      if (diff <= 0) { setCode(null); clearInterval(timerRef.current) }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => clearInterval(timerRef.current)
  }, [expiresAt])

  const handleGenerate = async () => {
    if (!member || loading) return
    setLoading(true)
    setError(null)
    setCode(null)
    try {
      const result = await generateJoinCode(getFamilyId(), member.id)
      setCode(result.code)
      setExpiresAt(result.expiresAt)
    } catch (e) {
      setError(e.message ?? 'Failed to generate code')
    } finally {
      setLoading(false)
    }
  }

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0')
  const ss = String(secsLeft % 60).padStart(2, '0')
  const pct = code ? secsLeft / CODE_TTL_SECS : 0
  const barColor = secsLeft > 180 ? 'var(--positive)' : secsLeft > 60 ? 'var(--warning)' : 'var(--negative)'

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleGenerate}
        disabled={loading || !member}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
        style={{ background: 'var(--accent-blue)', color: '#fff', opacity: loading ? 0.7 : 1 }}
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Generating...' : code ? 'Generate New Code' : 'Generate Code'}
      </button>

      {error && (
        <p className="text-xs font-mono text-center" style={{ color: 'var(--negative)' }}>{error}</p>
      )}

      {code && (
        <div className="flex flex-col items-center gap-4 px-3 py-5 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {member?.avatar} {member?.name}'s invite code
          </p>

          <div className="flex gap-2">
            {code.split('').map((ch, i) => (
              <div key={i} className="w-11 h-14 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
                <span className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{ch}</span>
              </div>
            ))}
          </div>

          <div className="w-full flex flex-col gap-1.5">
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${pct * 100}%`, background: barColor }} />
            </div>
            <p className="text-xs font-mono text-center"
              style={{ color: secsLeft > 60 ? 'var(--text-dim)' : 'var(--negative)' }}>
              {secsLeft > 0 ? `Expires in ${mm}:${ss}` : 'Expired — generate a new one'}
            </p>
          </div>

          <p className="text-xs font-mono text-center" style={{ color: 'var(--text-dim)', lineHeight: '1.5' }}>
            Open Arto on {member?.name}'s device and enter this code.
          </p>
        </div>
      )}
    </div>
  )
}
