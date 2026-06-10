import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useFamily } from '../../context/FamilyContext'
import InviteCodePanel from '../../components/InviteCodePanel'

export default function InviteCode() {
  const navigate = useNavigate()
  const { members } = useFamily()
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? null)

  const selectedMember = members.find(m => m.id === selectedId)

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
        <div className="px-3 py-2.5 rounded-xl text-xs font-mono"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)', lineHeight: '1.6' }}>
          Generate a one-time code for any family member's device. Once they enter it, their device will go straight to their PIN — no member selection needed.
        </div>

        {members.length === 0 ? (
          <p className="text-sm font-mono text-center" style={{ color: 'var(--text-muted)' }}>
            No members found. Add them in Family Members first.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>FOR WHICH MEMBER?</label>
              <div className="flex gap-2">
                {members.map(m => (
                  <button key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="flex-1 flex flex-col items-center py-3 px-2 rounded-xl transition-all active:scale-95"
                    style={{
                      background: selectedId === m.id ? 'var(--accent-blue)' : 'var(--bg-raised)',
                      border: `1px solid ${selectedId === m.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                    }}>
                    <span className="text-3xl">{m.avatar}</span>
                    <span className="text-xs font-mono mt-1"
                      style={{ color: selectedId === m.id ? '#fff' : 'var(--text-muted)' }}>
                      {m.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <InviteCodePanel member={selectedMember} />

            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>HOW IT WORKS</p>
              {[
                ['1', 'Generate a code for the family member above'],
                ['2', `${selectedMember?.name ?? 'Member'} opens Arto on their device for the first time`],
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
