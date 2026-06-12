import { useState } from 'react'
import { claimDevice } from '../../db/operations'

// 6-key code pad (0–9 + A–Z keys on a single screen)
const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function JoinFamily({ onClaimed, onSkip }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  const append = (ch) => {
    if (code.length < 6) setCode(c => c + ch)
  }
  const backspace = () => setCode(c => c.slice(0, -1))

  const handleSubmit = async () => {
    if (code.length !== 6 || loading) return
    setLoading(true)
    setError(null)
    try {
      const claim = await claimDevice(code)
      onClaimed(claim)
    } catch (e) {
      setError(e.message ?? 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-between h-full py-10 px-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-2 w-full">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>ARTO</p>
        <h1 className="text-2xl font-mono font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
          Join your family
        </h1>
        <p className="text-xs font-mono text-center mt-1" style={{ color: 'var(--text-muted)' }}>
          Ask a parent to generate an invite code, then enter it below.
        </p>
      </div>

      {/* Code display */}
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="flex gap-2 justify-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}
              className="w-10 h-12 rounded-lg flex items-center justify-center"
              style={{
                background: 'var(--bg-raised)',
                border: `1px solid ${i < code.length ? 'var(--accent-blue)' : 'var(--border)'}`,
              }}>
              <span className="text-lg font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                {code[i] ?? ''}
              </span>
            </div>
          ))}
        </div>

        {/* Error */}
        <div className="h-5 text-center">
          {error && (
            <span className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</span>
          )}
        </div>

        {/* Alphanumeric pad — 6 columns */}
        <div className="grid grid-cols-6 gap-1.5 w-full max-w-xs">
          {CODE_CHARS.map(ch => (
            <button key={ch}
              onClick={() => append(ch)}
              disabled={code.length >= 6}
              className="h-9 rounded-lg text-sm font-mono font-medium transition-all active:scale-90"
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                opacity: code.length >= 6 ? 0.4 : 1,
              }}>
              {ch}
            </button>
          ))}
          {/* Bottom row: clear + backspace spanning */}
          <button onClick={() => setCode('')}
            className="col-span-3 h-9 rounded-lg text-xs font-mono transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Clear
          </button>
          <button onClick={backspace}
            className="col-span-3 h-9 rounded-lg text-xs font-mono transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            ⌫ Back
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 w-full">
        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={code.length !== 6 || loading}
          className="w-full py-3.5 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{
            background: code.length === 6 ? 'var(--accent-blue)' : 'var(--bg-raised)',
            border: `1px solid ${code.length === 6 ? 'var(--accent-blue)' : 'var(--border)'}`,
            color: code.length === 6 ? '#fff' : 'var(--text-dim)',
            opacity: loading ? 0.7 : 1,
          }}>
          {loading ? 'Joining...' : 'Join Family →'}
        </button>

        {/* Parent bypass — for the device that set up the family */}
        {onSkip && (
          <button onClick={onSkip}
            className="text-xs font-mono underline"
            style={{ color: 'var(--text-dim)' }}>
            I'm the parent on the main device →
          </button>
        )}
      </div>
    </div>
  )
}
