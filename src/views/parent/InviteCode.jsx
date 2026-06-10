import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { useFamily } from '../../context/FamilyContext'
import { generateJoinCode } from '../../db/operations'
import { getFamilyId } from '../../utils/family'

const CODE_TTL_SECS = 600 // 10 minutes

export default function InviteCode() {
  const navigate = useNavigate()
  const { members } = useFamily()

  const allMembers = members
  const [selectedId, setSelectedId] = useState(allMembers[0]?.id ?? null)
  const [code,       setCode]       = useState(null)
  const [expiresAt,  setExpiresAt]  = useState(null)
  const [secsLeft,   setSecsLeft]   = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const timerRef = useRef(null)

  // Tick countdown
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000))
      setSecsLeft(diff)
      if (diff <= 0) {
        setCode(null)
        clearInterval(timerRef.current)
      }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => clearInterval(timerRef.current)
  }, [expiresAt])

  const handleGenerate = async () => {
    if (!selectedId || loading) return
    setLoading(true)
    setError(null)
    setCode(null)
    try {
      const result = await generateJoinCode(getFamilyId(), selectedId)
      setCode(result.code)
      setExpiresAt(result.expiresAt)
    } catch (e) {
      setError(e.message ?? 'Failed to generate code')
    } finally {
      setLoading(false)
    }
  }

  const selectedMember = allMembers.find(c => c.id === selectedId)

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0')
  const ss = String(secsLeft % 60).padStart(2, '0')
  const pct = code ? secsLeft / CODE_TTL_SECS : 0
  const barColor = secsLeft > 180 ? 'var(--positive)' : secsLeft > 60 ? 'var(--warning)' : 'var(--negative)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 rounded-lg transition-all active:scale-90"
          style={{ color: 'var(--text-muted)' }}>
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Invite Code
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* Info */}
        <div className="px-3 py-2.5 rounded-xl text-xs font-mono"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)', lineHeight: '1.6' }}>
          Generate a one-time code for any family member's device. Once they enter it, their device will go straight to their PIN — no member selection needed.
        </div>

        {/* Child selector */}
        {allMembers.length === 0 ? (
          <p className="text-sm font-mono text-center" style={{ color: 'var(--text-muted)' }}>
            No members found. Add them in Family Members first.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>FOR WHICH MEMBER?</label>
              <div className="flex gap-2">
                {allMembers.map(ch => (
                  <button key={ch.id}
                    onClick={() => { setSelectedId(ch.id); setCode(null); setError(null) }}
                    className="flex-1 flex flex-col items-center py-3 px-2 rounded-xl transition-all active:scale-95"
                    style={{
                      background: selectedId === ch.id ? 'var(--accent-blue)' : 'var(--bg-raised)',
                      border: `1px solid ${selectedId === ch.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                    }}>
                    <span className="text-3xl">{ch.avatar}</span>
                    <span className="text-xs font-mono mt-1"
                      style={{ color: selectedId === ch.id ? '#fff' : 'var(--text-muted)' }}>
                      {ch.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <button onClick={handleGenerate} disabled={loading || !selectedId}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{
                background: 'var(--accent-blue)',
                border: '1px solid var(--accent-blue)',
                color: '#fff',
                opacity: loading ? 0.7 : 1,
              }}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Generating...' : code ? 'Generate New Code' : 'Generate Code'}
            </button>

            {error && (
              <p className="text-xs font-mono text-center" style={{ color: 'var(--negative)' }}>{error}</p>
            )}

            {/* Code display */}
            {code && (
              <div className="flex flex-col items-center gap-4 px-3 py-5 rounded-xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  {selectedMember?.avatar} {selectedMember?.name}'s invite code
                </p>

                {/* Big code */}
                <div className="flex gap-2">
                  {code.split('').map((ch, i) => (
                    <div key={i}
                      className="w-11 h-14 rounded-xl flex items-center justify-center"
                      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
                      <span className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                        {ch}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Countdown bar */}
                <div className="w-full flex flex-col gap-1.5">
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${pct * 100}%`, background: barColor }} />
                  </div>
                  <p className="text-xs font-mono text-center" style={{ color: secsLeft > 60 ? 'var(--text-dim)' : 'var(--negative)' }}>
                    {secsLeft > 0 ? `Expires in ${mm}:${ss}` : 'Expired — generate a new one'}
                  </p>
                </div>

                <p className="text-xs font-mono text-center" style={{ color: 'var(--text-dim)', lineHeight: '1.5' }}>
                  Show this code to {selectedMember?.name}.{'\n'}
                  They enter it on their device to link it.
                </p>
              </div>
            )}

            {/* Instructions */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>HOW IT WORKS</p>
              {[
                ['1', 'Generate a code for the family member above'],
                ['2', `${selectedMember?.name ?? 'Member'} opens Artha on their device for the first time`],
                ['3', 'They enter the 6-character code'],
                ['4', 'Their device goes straight to their PIN — no member picker needed'],
              ].map(([n, txt]) => (
                <div key={n} className="flex items-start gap-3">
                  <span className="text-xs font-mono w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                    {n}
                  </span>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>{txt}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
