import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Clock, XCircle, Circle, Zap } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFamily } from '../../context/FamilyContext'
import { getChoreLogsForDate, addChoreLog } from '../../db/operations'
import { getDueChoresForMember, getAvailableBonusChores, buildLogMap } from '../../engine/chores'
import { today, displayDate } from '../../utils/dates'
import { useCurrency } from '../../context/FamilyContext'

// Expected completions per week for a chore
function weeklyFreq(chore) {
  switch (chore.recurrence) {
    case 'daily':   return 7
    case 'weekday': return 5
    case 'weekend': return 2
    case 'weekly':  return 1
    case 'custom':  return chore.daysPerWeek ?? 3
    default:        return 0
  }
}

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === 'approved') return <CheckCircle size={20} style={{ color: 'var(--positive)' }} />
  if (status === 'pending')  return <Clock size={20} style={{ color: 'var(--warning)' }} />
  if (status === 'rejected') return <XCircle size={20} style={{ color: 'var(--negative)' }} />
  return <Circle size={20} style={{ color: 'var(--text-dim)' }} />
}

// ── Mandatory chore row ───────────────────────────────────────────────────────
function MandatoryRow({ chore, log, worth, onMark, marking }) {
  const fmt = useCurrency()
  const status = log?.status ?? null
  const canMark = !status || status === 'rejected'
  const isMarking = marking === chore.id

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${status === 'approved' ? 'rgba(74,222,128,0.2)' : 'var(--border)'}`,
      }}>
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono" style={{
          color: status === 'approved' ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: status === 'approved' ? 'line-through' : 'none',
        }}>
          {chore.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {worth > 0 && status === 'approved' && (
            <span className="text-xs font-mono" style={{ color: 'var(--positive)' }}>
              ✓ +{fmt(worth)}
            </span>
          )}
          {worth > 0 && status !== 'approved' && (
            <span className="text-xs font-mono" style={{ color: status === 'pending' ? 'var(--text-dim)' : 'var(--text-muted)' }}>
              +{fmt(worth)}
            </span>
          )}
          {status === 'pending' && (
            <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>· waiting</span>
          )}
          {status === 'rejected' && (
            <span className="text-xs font-mono" style={{ color: 'var(--negative)' }}>· rejected — try again</span>
          )}
        </div>
      </div>
      {canMark && (
        <button
          disabled={isMarking}
          onClick={() => onMark(chore)}
          className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95"
          style={{
            background: isMarking ? 'var(--border)' : 'var(--bg-raised)',
            border: '1px solid var(--border-bright)',
            color: isMarking ? 'var(--text-dim)' : 'var(--text-primary)',
          }}>
          {isMarking ? '...' : 'Done'}
        </button>
      )}
    </div>
  )
}

// ── Bonus chore row ───────────────────────────────────────────────────────────
function BonusRow({ chore, log, onClaim, claiming }) {
  const fmt = useCurrency()
  const status = log?.status ?? null
  const isClaiming = claiming === chore.id

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${status === 'approved' ? 'rgba(74,222,128,0.2)' : 'var(--border)'}`,
      }}>
      <Zap size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
          {chore.title}
        </p>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--positive)' }}>
          {fmt(chore.value)} bonus
        </p>
      </div>
      {!status && (
        <button
          disabled={isClaiming}
          onClick={() => onClaim(chore)}
          className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95"
          style={{
            background: isClaiming ? 'var(--border)' : 'rgba(74,222,128,0.15)',
            border: '1px solid rgba(74,222,128,0.3)',
            color: isClaiming ? 'var(--text-dim)' : 'var(--positive)',
          }}>
          {isClaiming ? '...' : 'Claim'}
        </button>
      )}
      {status === 'pending' && (
        <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>⏳ Submitted</span>
      )}
      {status === 'approved' && (
        <span className="text-xs font-mono" style={{ color: 'var(--positive)' }}>✓ Earned</span>
      )}
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Chores() {
  const { currentMember } = useAuth()
  const { chores: allChores, reloadCount } = useFamily()

  const [logMap, setLogMap]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [marking, setMarking]   = useState(null)
  const [claiming, setClaiming] = useState(null)

  const dateStr = today()

  const dueChores   = getDueChoresForMember(allChores, currentMember?.id ?? '')
  const bonusChores = getAvailableBonusChores(allChores, currentMember?.id ?? '')

  // Per-completion value: salary divided proportionally by weekly frequency
  const allMandatory = allChores.filter(c =>
    c.type === 'mandatory' && c.isActive && c.assignedTo.includes(currentMember?.id ?? '')
  )
  const totalWeeklyExpected = allMandatory.reduce((s, c) => s + weeklyFreq(c), 0)
  const perCompletion = totalWeeklyExpected > 0
    ? Math.round((currentMember?.baseSalary ?? 0) / totalWeeklyExpected)
    : 0

  const loadLogs = useCallback(async () => {
    if (!currentMember) return
    const logs = await getChoreLogsForDate(currentMember.id, dateStr)
    setLogMap(buildLogMap(logs))
    setLoading(false)
  }, [currentMember, dateStr])

  useEffect(() => { loadLogs() }, [loadLogs, reloadCount])

  const handleMark = async (chore) => {
    setMarking(chore.id)
    await addChoreLog({ choreId: chore.id, memberId: currentMember.id, date: dateStr })
    await loadLogs()
    setMarking(null)
  }

  const handleClaim = async (chore) => {
    setClaiming(chore.id)
    await addChoreLog({ choreId: chore.id, memberId: currentMember.id, date: dateStr })
    await loadLogs()
    setClaiming(null)
  }

  const approvedCount = dueChores.filter(c => logMap[c.id]?.status === 'approved').length
  const completionPct = dueChores.length > 0
    ? Math.round((approvedCount / dueChores.length) * 100)
    : 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {displayDate(dateStr).toUpperCase()}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Today's Chores
          </h2>
          <span className="text-sm font-mono font-bold"
            style={{ color: completionPct === 100 ? 'var(--positive)' : 'var(--text-muted)' }}>
            {approvedCount}/{dueChores.length}
          </span>
        </div>
        {/* Progress bar */}
        {dueChores.length > 0 && (
          <div className="mt-2 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-raised)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${completionPct}%`,
                background: completionPct === 100 ? 'var(--positive)' : 'var(--accent-blue)',
              }}
            />
          </div>
        )}
      </div>

      {/* Vacation notice */}
      {currentMember?.config?.vacation?.active && (
        <div className="px-4 py-2.5 flex items-center gap-2 shrink-0"
          style={{ background: 'rgba(96,165,250,0.08)', borderBottom: '1px solid rgba(96,165,250,0.2)' }}>
          <span className="text-sm">✈️</span>
          <p className="text-xs font-mono" style={{ color: '#60a5fa' }}>
            {currentMember.config.vacation.paidLeave
              ? 'Paid leave — chores are optional this period'
              : 'Unpaid leave — no penalties for skipping chores'}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {loading ? (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>
            Loading...
          </p>
        ) : (
          <>
            {/* Mandatory chores */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>
                TODAY'S TASKS
              </p>
              {dueChores.length === 0 ? (
                <p className="text-xs font-mono text-center py-4" style={{ color: 'var(--text-dim)' }}>
                  No mandatory chores today
                </p>
              ) : (
                dueChores.map(chore => (
                  <MandatoryRow
                    key={chore.id}
                    chore={chore}
                    log={logMap[chore.id]}
                    worth={perCompletion}
                    onMark={handleMark}
                    marking={marking}
                  />
                ))
              )}
            </div>

            {/* Bonus chores */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>
                EARN MORE ⚡
              </p>
              {bonusChores.length === 0 ? (
                <p className="text-xs font-mono text-center py-4" style={{ color: 'var(--text-dim)' }}>
                  No bonus tasks available today
                </p>
              ) : (
                bonusChores.map(chore => (
                  <BonusRow
                    key={chore.id}
                    chore={chore}
                    log={logMap[chore.id]}
                    onClaim={handleClaim}
                    claiming={claiming}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
