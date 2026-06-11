import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, SlidersHorizontal, Gift, Landmark, Download, Users, HandCoins, QrCode, Receipt, Plane, FastForward, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFamily } from '../../context/FamilyContext'
import { useStages } from '../../hooks/useStage'
import { updateFamilyConfig, applyStagePatches } from '../../db/operations'
import { getFamilyId } from '../../utils/family'

const items = [
  { icon: Users,            label: 'Family Members',    sub: 'Edit names, PINs, add children',        to: '/parent/members'      },
  { icon: HandCoins,        label: 'Loans',             sub: 'Active loans, interest, payoff',        to: '/parent/loans',       feature: 'loans' },
  { icon: QrCode,           label: 'Invite Code',       sub: "Set up a child's device with one code", to: '/parent/invite-code'  },
  { icon: Plane,            label: 'Vacation Mode',     sub: 'Pause chores & scoring during holidays', to: '/parent/vacation',   feature: 'vacation' },
  { icon: Zap,              label: 'Utility Logger',    sub: 'Log electricity, water charges',        to: '/parent/utilities',   feature: 'utilities' },
  { icon: SlidersHorizontal,label: 'Economic Controls', sub: 'Tax, rent, interest, auto-save',        to: '/parent/economy'      },
  { icon: Gift,             label: 'Reward Manager',    sub: 'Add & price rewards',                   to: '/parent/rewards'      },
  { icon: Landmark,         label: 'Tax Fund',          sub: 'Family tax balance & spending',         to: '/parent/tax-fund',    feature: 'familyFund' },
  { icon: Receipt,          label: 'Expenses Collected', sub: 'Reconcile rent, utilities & tax per child', to: '/parent/expenses' },
  { icon: Download,         label: 'Backup & Restore',  sub: 'Export / import family data',           to: '/parent/backup'       },
]

// ── Skip guided period confirm sheet (W6; copy per W9 spec) ────────────────────
function SkipGuidedSheet({ onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const handleConfirm = async () => {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Skip the guided period?
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4 flex flex-col gap-4">
          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
            This unlocks everything immediately — loans, credit score, philanthropy,
            and all economic controls — and sets the standard rates (20% auto-save,
            2% savings interest, 3% philanthropy) for every child. You can adjust
            all of them in Economic Controls.
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-dim)', lineHeight: '1.6' }}>
            Most families enjoy the five-payday guided journey.
            Skipping can't be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-mono transition-all active:scale-95"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Keep guiding
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="flex-1 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: 'var(--warning)', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Unlocking...' : 'Skip & unlock all'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function More() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { family, children, reload } = useFamily()
  const { has, guidedActive } = useStages()
  const [showSkipSheet, setShowSkipSheet] = useState(false)
  const anyOnVacation = children.some(c => c.config?.vacation?.active)

  const visibleItems = items.filter(({ feature }) => !feature || has(feature))

  // Sets the override AND applies the cumulative stage patches to every child —
  // a skipped family runs the same default economy a graduated family runs.
  const handleSkipGuided = async () => {
    await updateFamilyConfig(getFamilyId(), { ...(family?.config ?? {}), stageOverride: 'economist' })
    for (const child of children) {
      await applyStagePatches(child, 'economist')
    }
    await reload()
    setShowSkipSheet(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>More</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        {visibleItems.map(({ icon: Icon, label, sub, to, soon }) => (
          <button key={to} onClick={() => navigate(to)}
            className="flex items-center gap-4 p-4 rounded-xl text-left w-full transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--bg-raised)' }}>
              <Icon size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{sub}</p>
            </div>
            {to === '/parent/vacation' && anyOnVacation && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                ✈️ active
              </span>
            )}
            {soon && (
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: 'var(--bg-raised)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                soon
              </span>
            )}
          </button>
        ))}

        {/* Skip the guided period — always available while guiding (W6) */}
        {guidedActive && children.length > 0 && (
          <button onClick={() => setShowSkipSheet(true)}
            className="flex items-center gap-4 p-4 rounded-xl text-left w-full transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-bright)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--bg-raised)' }}>
              <FastForward size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>Skip the guided period</p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Unlock all features for every child now</p>
            </div>
          </button>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={logout}
            className="w-full py-3 rounded-xl text-sm font-mono transition-all active:scale-95"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Log Out
          </button>
        </div>
      </div>

      {showSkipSheet && (
        <SkipGuidedSheet
          onConfirm={handleSkipGuided}
          onClose={() => setShowSkipSheet(false)}
        />
      )}
    </div>
  )
}
