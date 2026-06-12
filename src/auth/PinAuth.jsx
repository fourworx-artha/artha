import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { useDevice } from '../context/DeviceContext'
import { Delete } from 'lucide-react'

// ── PIN Pad ───────────────────────────────────────────────────────────────────

function PinPad({ value, onChange, onSubmit, error, onClear }) {
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const handleKey = (key) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1))
    } else if (value.length < 4) {
      const next = value + key
      onChange(next)
      if (next.length === 4) onSubmit(next)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN dots */}
      <div className="flex gap-4">
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`pin-dot ${i < value.length ? 'filled' : ''}`}
          />
        ))}
      </div>

      {/* Error */}
      <div className="h-5 text-center">
        {error && (
          <span className="text-xs font-mono" style={{ color: 'var(--negative)' }}>
            {error}
          </span>
        )}
      </div>

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-3 w-56">
        {digits.map((d, i) => (
          d === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => handleKey(d)}
              className="h-14 w-full rounded-lg text-lg font-mono font-medium transition-all active:scale-95"
              style={{
                background: d === '⌫' ? 'transparent' : 'var(--bg-raised)',
                border: `1px solid ${d === '⌫' ? 'transparent' : 'var(--border)'}`,
                color: 'var(--text-primary)',
              }}
            >
              {d === '⌫' ? <Delete size={18} className="mx-auto" /> : d}
            </button>
          )
        ))}
      </div>
    </div>
  )
}

// ── Avatar Selector ───────────────────────────────────────────────────────────

function AvatarGrid({ members, onSelect, selected }) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div>
        <p className="text-xs font-mono text-center mb-1" style={{ color: 'var(--text-muted)' }}>
          ARTO
        </p>
        <h1 className="text-2xl font-mono font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
          Who are you?
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full px-4">
        {members.map(member => (
          <button
            key={member.id}
            onClick={() => onSelect(member)}
            className="flex flex-col items-center gap-2 p-5 rounded-xl transition-all active:scale-95"
            style={{
              background: selected?.id === member.id ? 'var(--bg-raised)' : 'var(--bg-surface)',
              border: `1px solid ${selected?.id === member.id ? 'var(--accent-blue)' : 'var(--border)'}`,
            }}
          >
            <span className="text-5xl">{member.avatar}</span>
            <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
              {member.name}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {member.role === 'parent' ? 'Parent' : 'Child'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main Login Screen ─────────────────────────────────────────────────────────

export default function PinAuth() {
  const { members, loading } = useFamily()
  const { login, loginError, setLoginError } = useAuth()
  const navigate = useNavigate()

  const deviceClaim = useDevice()

  const [selectedMember, setSelectedMember] = useState(null)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // If this device is claimed to a specific member, auto-select them
  useEffect(() => {
    if (!deviceClaim?.memberId || !members.length) return
    const m = members.find(m => m.id === deviceClaim.memberId)
    if (m) setSelectedMember(m)
  }, [deviceClaim, members])

  // Reset PIN and error when switching member
  useEffect(() => {
    setPin('')
    setLoginError(null)
  }, [selectedMember, setLoginError])

  const handleSelect = (member) => {
    setSelectedMember(member)
  }

  const handleSubmit = async (rawPin) => {
    if (!selectedMember || submitting) return
    setSubmitting(true)
    const ok = await login(selectedMember.id, rawPin)
    setSubmitting(false)

    if (ok) {
      // Route based on role
      if (selectedMember.role === 'parent') {
        navigate('/parent')
      } else {
        navigate('/child/home')
      }
    } else {
      setPin('')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          Loading...
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-between h-full py-12 px-4">
      {!selectedMember ? (
        <AvatarGrid members={members} onSelect={handleSelect} selected={selectedMember} />
      ) : (
        <div className="flex flex-col items-center gap-8 w-full">
          {/* Back + selected member */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-6xl">{selectedMember.avatar}</span>
            <span className="text-lg font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {selectedMember.name}
            </span>
            <button
              onClick={() => setSelectedMember(null)}
              className="text-xs font-mono underline"
              style={{ color: 'var(--text-muted)' }}
            >
              ← change
            </button>
          </div>

          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
            Enter your PIN
          </p>

          <PinPad
            value={pin}
            onChange={setPin}
            onSubmit={handleSubmit}
            error={loginError}
          />
        </div>
      )}

      {/* Footer */}
      <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
        ARTO v0.1 — Family Economy
      </p>
    </div>
  )
}
