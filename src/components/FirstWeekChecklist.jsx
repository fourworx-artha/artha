import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useFamily } from '../context/FamilyContext'
import { getFirstWeekProgress } from '../db/operations'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Row({ done, pending = false, label, hint, onTap }) {
  const Tag = onTap ? 'button' : 'div'
  return (
    <Tag
      onClick={onTap ?? undefined}
      className={`flex items-center gap-2.5 w-full text-left ${onTap ? 'transition-all active:scale-[0.98]' : ''}`}
      style={{ background: 'none', border: 'none', padding: '5px 0', cursor: onTap ? 'pointer' : 'default' }}>
      <span className="shrink-0 text-sm" style={{ width: 18, textAlign: 'center' }}>
        {pending ? '⏳' : done ? '☑' : '☐'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono"
          style={{ color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
          {label}
        </p>
        {!done && hint && (
          <p className="text-xs font-mono" style={{ color: 'var(--text-dim)', fontSize: 10 }}>{hint}</p>
        )}
      </div>
      {onTap && !done && <ChevronRight size={12} style={{ color: 'var(--text-dim)' }} />}
    </Tag>
  )
}

/**
 * Parent dashboard "Getting Started" card (W8) — bridges the dead-air window
 * between onboarding and the first payday. All computed from existing data
 * (device_claims / chore_logs / settledCounts); hides itself once the family
 * has any settled payslip.
 */
export default function FirstWeekChecklist() {
  const { family, children, settledCounts, reloadCount } = useFamily()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(null)

  const anySettled = settledCounts !== null &&
    Object.values(settledCounts).some(n => n > 0)
  const visible = settledCounts !== null && !anySettled && children.length > 0

  useEffect(() => {
    if (!visible) return
    getFirstWeekProgress(children.map(c => c.id))
      .then(setProgress)
      .catch(() => {})
  }, [visible, children, reloadCount])

  if (!visible || !progress) return null

  const paydayName = DAY_NAMES[family?.config?.paydayDow ?? 6]
  const firstChild = children[0]
  const choreHintName = children.length === 1 ? `${firstChild.name}'s` : 'the kids\''

  return (
    <div className="p-4 rounded-xl flex flex-col gap-1"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-bright)' }}>
      <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        GETTING STARTED
      </p>
      <Row done label="Family created" />
      {children.map(child => (
        <Row key={child.id}
          done={progress.claimedMemberIds.includes(child.id)}
          label={`${child.name} logged in on their device`}
          hint="generate an invite code"
          onTap={() => navigate('/parent/invite-code')}
        />
      ))}
      <Row
        done={progress.anyChoreLog}
        label="First chore logged"
        hint={`this one's ${choreHintName} move`}
      />
      <Row
        done={progress.anyChoreApproved}
        label="First chore approved"
        hint="approve it in the Approve tab"
        onTap={() => navigate('/parent/approve')}
      />
      <Row pending label={`First payday — ${paydayName}`} />
    </div>
  )
}
