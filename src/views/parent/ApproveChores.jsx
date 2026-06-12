import { useState, useEffect, useCallback } from 'react'
import { Check, X, RefreshCw, Gift, Heart, Target, Landmark, Banknote } from 'lucide-react'
import { useFamily } from '../../context/FamilyContext'
import {
  getPendingLogsForMembers, approveChoreLog, rejectChoreLog,
  approveBonusChoreLog,
  getPendingRewardRequests, approveRewardRequest, rejectRewardRequest,
  updateCreditScore,
  getPendingMemberRequests, approveDonation, approveSubGoalWithdrawal, approveSpendingWithdrawal, approveSavingsWithdrawal, resolveMemberRequest,
} from '../../db/operations'
import { displayDate } from '../../utils/dates'
import { useCurrency } from '../../context/FamilyContext'
import { choreWeeklyFreq as weeklyFreq } from '../../engine/chores'

export default function ApproveChores() {
  const { children, chores, reload } = useFamily()
  const fmt = useCurrency()

  const [logs,            setLogs]            = useState([])
  const [rewardRequests,  setRewardRequests]  = useState([])
  const [memberRequests,  setMemberRequests]  = useState([])
  const [loading,         setLoading]         = useState(true)
  const [acting,          setActing]          = useState(null)

  const choreMap  = Object.fromEntries(chores.map(c => [c.id, c]))
  const memberMap = Object.fromEntries(children.map(m => [m.id, m]))

  const loadAll = useCallback(async () => {
    setLoading(true)
    const ids = children.map(c => c.id)
    const [pending, rewards, memberReqs] = await Promise.all([
      getPendingLogsForMembers(ids),
      getPendingRewardRequests(ids),
      getPendingMemberRequests(ids),
    ])
    pending.sort((a, b) => b.completedAt - a.completedAt)
    rewards.sort((a, b) => b.requestedAt - a.requestedAt)
    memberReqs.sort((a, b) => b.requestedAt - a.requestedAt)
    setLogs(pending)
    setRewardRequests(rewards)
    setMemberRequests(memberReqs)
    setLoading(false)
  }, [children])

  useEffect(() => { loadAll() }, [loadAll])

  // Chore actions
  const approveChore = async (log) => {
    setActing(log.id)
    const chore  = choreMap[log.choreId]
    const member = memberMap[log.memberId]
    try {
      if (chore?.type === 'bonus') {
        await approveBonusChoreLog(log.id)
        await reload()
      } else {
        await approveChoreLog(log.id)
        if (chore?.type === 'mandatory') updateCreditScore(log.memberId, 2).catch(() => {})
      }
      setLogs(prev => prev.filter(l => l.id !== log.id))
    } catch (e) {
      console.error('[Artha] approveChore error:', e)
      alert(`Approval failed: ${e.message}`)
    } finally {
      setActing(null)
    }
  }

  const rejectChore = async (log) => {
    setActing(log.id)
    const chore = choreMap[log.choreId]
    try {
      await rejectChoreLog(log.id)
      if (chore?.type === 'mandatory') updateCreditScore(log.memberId, -5).catch(() => {})
      setLogs(prev => prev.filter(l => l.id !== log.id))
    } catch (e) {
      console.error('[Artha] rejectChore error:', e)
      alert(`Reject failed: ${e.message}`)
    } finally {
      setActing(null)
    }
  }

  // Reward request actions
  const approveReward = async (req) => {
    setActing(req.id)
    try {
      await approveRewardRequest(req.id, req.memberId, req.amount)
      setRewardRequests(prev => prev.filter(r => r.id !== req.id))
    } catch (e) {
      alert(e.message) // insufficient balance — surface to parent
    } finally {
      setActing(null)
    }
  }
  const rejectReward = async (req) => {
    setActing(req.id)
    await rejectRewardRequest(req.id)
    setRewardRequests(prev => prev.filter(r => r.id !== req.id))
    setActing(null)
  }

  // Group chore logs by member
  const groupedChores = children.reduce((acc, child) => {
    const childLogs = logs.filter(l => l.memberId === child.id)
    if (childLogs.length > 0) acc.push({ member: child, logs: childLogs })
    return acc
  }, [])

  // Member request actions (donation / sub-goal withdrawal)
  const approveMemberReq = async (req) => {
    setActing(req.id)
    const member = memberMap[req.memberId]
    try {
      if (req.type === 'donation') {
        await approveDonation(req.id, req.memberId, req.amount, req.description)
      } else if (req.type === 'subgoal_withdrawal') {
        await approveSubGoalWithdrawal(req.id, req.memberId, req.amount, req.metadata ?? {})
      } else if (req.type === 'cash_withdrawal') {
        await approveSpendingWithdrawal(req.id, req.memberId, req.amount, req.metadata?.destination ?? 'cash')
      } else if (req.type === 'savings_withdrawal') {
        await approveSavingsWithdrawal(req.id, req.memberId, req.amount)
      }
      setMemberRequests(prev => prev.filter(r => r.id !== req.id))
      await reload()
    } catch (e) {
      alert(e.message)
    } finally {
      setActing(null)
    }
  }

  const denyMemberReq = async (req) => {
    setActing(req.id)
    await resolveMemberRequest(req.id, 'denied')
    setMemberRequests(prev => prev.filter(r => r.id !== req.id))
    setActing(null)
  }

  // Group reward requests by member
  const groupedRewards = children.reduce((acc, child) => {
    const childReqs = rewardRequests.filter(r => r.memberId === child.id)
    if (childReqs.length > 0) acc.push({ member: child, requests: childReqs })
    return acc
  }, [])

  // Group member requests by member
  const groupedMemberRequests = children.reduce((acc, child) => {
    const childReqs = memberRequests.filter(r => r.memberId === child.id)
    if (childReqs.length > 0) acc.push({ member: child, requests: childReqs })
    return acc
  }, [])

  const totalPending = logs.length + rewardRequests.length + memberRequests.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Approvals
            {totalPending > 0 && (
              <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-full"
                style={{ background: 'var(--negative)', color: '#fff' }}>
                {totalPending}
              </span>
            )}
          </h2>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {loading && (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        )}

        {!loading && totalPending === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>All caught up</p>
          </div>
        )}

        {/* ── Chore approvals ── */}
        {groupedChores.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>CHORE COMPLETIONS</p>
              {logs.length > 1 && (
                <button
                  disabled={!!acting}
                  onClick={async () => {
                    for (const log of [...logs]) {
                      await approveChore(log)
                    }
                  }}
                  className="text-xs font-mono px-2 py-1 rounded-lg transition-all active:scale-95"
                  style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--positive)', border: '1px solid rgba(74,222,128,0.25)' }}>
                  Approve All ({logs.length})
                </button>
              )}
            </div>
            {groupedChores.map(({ member, logs: memberLogs }) => (
              <div key={member.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xl">{member.avatar}</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {member.name.toUpperCase()} — {memberLogs.length} pending
                  </span>
                </div>
                {memberLogs.map(log => {
                  const chore    = choreMap[log.choreId]
                  const isActing = acting === log.id
                  return (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: isActing ? 0.5 : 1 }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                          {chore?.title ?? 'Unknown chore'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                            {displayDate(log.date)}
                          </span>
                          {chore?.type === 'bonus' && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--positive)', border: '1px solid rgba(74,222,128,0.25)' }}>
                              ⚡ +{fmt(chore.value)} on payslip
                            </span>
                          )}
                        </div>
                      </div>
                      <button disabled={isActing} onClick={() => rejectChore(log)}
                        className="p-2 rounded-lg active:scale-95"
                        style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--negative)' }}>
                        <X size={16} />
                      </button>
                      <button disabled={isActing} onClick={() => approveChore(log)}
                        className="p-2 rounded-lg active:scale-95"
                        style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--positive)' }}>
                        <Check size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Reward requests ── */}
        {groupedRewards.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>REWARD REQUESTS</p>
            {groupedRewards.map(({ member, requests }) => (
              <div key={member.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xl">{member.avatar}</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {member.name.toUpperCase()} — {requests.length} request{requests.length > 1 ? 's' : ''}
                  </span>
                </div>
                {requests.map(req => {
                  const isActing = acting === req.id
                  const wallet   = member.accounts?.spending ?? 0
                  const canAfford = wallet >= req.amount
                  return (
                    <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: isActing ? 0.5 : 1 }}>
                      <Gift size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                          {req.rewardTitle}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--warning)' }}>
                            {fmt(req.amount)}
                          </span>
                          <span className="text-xs font-mono" style={{ color: canAfford ? 'var(--text-muted)' : 'var(--negative)' }}>
                            wallet: {fmt(wallet)}
                          </span>
                        </div>
                      </div>
                      <button disabled={isActing} onClick={() => rejectReward(req)}
                        className="p-2 rounded-lg active:scale-95"
                        style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--negative)' }}>
                        <X size={16} />
                      </button>
                      <button disabled={isActing || !canAfford} onClick={() => approveReward(req)}
                        className="p-2 rounded-lg active:scale-95"
                        style={{
                          background: canAfford ? 'rgba(74,222,128,0.15)' : 'var(--bg-raised)',
                          color: canAfford ? 'var(--positive)' : 'var(--text-dim)',
                        }}>
                        <Check size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Donation & sub-goal withdrawal requests ── */}
        {groupedMemberRequests.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>PHILANTHROPY REQUESTS</p>
            {groupedMemberRequests.map(({ member, requests }) => (
              <div key={member.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xl">{member.avatar}</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {member.name.toUpperCase()} — {requests.length} request{requests.length > 1 ? 's' : ''}
                  </span>
                </div>
                {requests.map(req => {
                  const isActing   = acting === req.id
                  const isDonation         = req.type === 'donation'
                  const isSubGoal          = req.type === 'subgoal_withdrawal'
                  const isCashOut          = req.type === 'cash_withdrawal'
                  const isSavingsWithdraw  = req.type === 'savings_withdrawal'
                  const meta               = req.metadata ?? {}

                  // Balance check
                  const balance = isDonation
                    ? (member.accounts?.philanthropy ?? 0)
                    : isSavingsWithdraw
                    ? (member.accounts?.savings ?? 0)
                    : isCashOut
                    ? (member.accounts?.spending ?? 0)
                    : (() => {
                        const sg = (member.accounts?.subGoals ?? []).find(s => s.id === meta.subGoalId)
                        return sg?.balance ?? 0
                      })()
                  const canAfford = balance >= req.amount

                  // Label lines
                  const title = isDonation
                    ? `Donate to ${req.description || 'charity'}`
                    : isSavingsWithdraw
                    ? 'Withdraw from savings → wallet'
                    : isCashOut
                    ? `Wallet withdrawal — ${meta.destination === 'bank' ? 'Bank transfer' : 'Physical cash'}`
                    : `Withdraw from "${meta.subGoalName ?? 'goal'}"`
                  const subtitle = isDonation
                    ? `philanthropy: ${fmt(balance)}`
                    : isSavingsWithdraw
                    ? `savings bal: ${fmt(balance)}${meta.note ? ' · ' + meta.note : ''}`
                    : isCashOut
                    ? `wallet: ${fmt(balance)}${meta.note ? ' · ' + meta.note : ''}`
                    : `→ ${meta.destination ?? 'spending'} · goal bal: ${fmt(balance)}${meta.deleteGoal ? ' · delete goal' : ''}`

                  return (
                    <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: isActing ? 0.5 : 1 }}>
                      {isDonation
                        ? <Heart     size={18} style={{ color: 'var(--positive)',   flexShrink: 0 }} />
                        : isSavingsWithdraw
                        ? <Landmark  size={18} style={{ color: '#60a5fa',           flexShrink: 0 }} />
                        : isCashOut
                        ? <Banknote  size={18} style={{ color: 'var(--warning)',    flexShrink: 0 }} />
                        : <Target    size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                          {title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs font-mono font-semibold" style={{ color: isDonation ? 'var(--positive)' : 'var(--accent-blue)' }}>
                            {fmt(req.amount)}
                          </span>
                          <span className="text-xs font-mono" style={{ color: canAfford ? 'var(--text-muted)' : 'var(--negative)', fontSize: 10 }}>
                            {subtitle}
                          </span>
                        </div>
                      </div>
                      <button disabled={isActing} onClick={() => denyMemberReq(req)}
                        className="p-2 rounded-lg active:scale-95"
                        style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--negative)' }}>
                        <X size={16} />
                      </button>
                      <button disabled={isActing || !canAfford} onClick={() => approveMemberReq(req)}
                        className="p-2 rounded-lg active:scale-95"
                        style={{
                          background: canAfford ? 'rgba(74,222,128,0.15)' : 'var(--bg-raised)',
                          color: canAfford ? 'var(--positive)' : 'var(--text-dim)',
                        }}>
                        <Check size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
