import { supabase } from './supabase'
import { today } from '../utils/dates'
import { DEFAULT_CONFIG, STAGE_GATED_KEYS, STAGE_PATCHES } from '../utils/constants'
import { deriveStage, buildStagePatch, unlockedStageKeys } from '../utils/stages'
import { getFamilyId, setFamilyId } from '../utils/family'
import { formatCurrency } from '../utils/currency'
import { getDueChoresForMember } from '../engine/chores'

// ── Row mappers (DB snake_case → JS camelCase) ────────────────────────────────

function mapFamily(row) {
  if (!row) return null
  return {
    id:               row.id,
    name:             row.name,
    config:           row.config,
    taxFundBalance:   row.tax_fund_balance,
    taxFundHistory:   row.tax_fund_history,
  }
}

function mapMember(row) {
  if (!row) return null
  return {
    id:                     row.id,
    familyId:               row.family_id,
    name:                   row.name,
    avatar:                 row.avatar,
    role:                   row.role,
    pin:                    row.pin,
    baseSalary:             row.base_salary,
    accounts:               row.accounts,
    config:                 row.config,
    creditScore:            row.credit_score,
    lastCreditPopupPeriod:  row.last_credit_popup_period,
    createdAt:              row.created_at,
  }
}

function mapChore(row) {
  if (!row) return null
  return {
    id:           row.id,
    familyId:     row.family_id,
    title:        row.title,
    type:         row.type,
    recurrence:   row.recurrence,
    daysPerWeek:  row.days_per_week,
    daysOfWeek:   row.days_of_week,
    value:        row.value,
    assignedTo:   row.assigned_to ?? [],
    isActive:     row.is_active ?? true,
  }
}

function mapChoreLog(row) {
  if (!row) return null
  return {
    id:          row.id,
    choreId:     row.chore_id,
    memberId:    row.member_id,
    date:        row.date,
    status:      row.status,
    completedAt: row.completed_at,
    approvedAt:  row.approved_at,
  }
}

function mapTransaction(row) {
  if (!row) return null
  return {
    id:          row.id,
    memberId:    row.member_id,
    type:        row.type,
    amount:      row.amount,
    description: row.description,
    date:        row.date,
    relatedId:   row.related_id,
  }
}

function mapPayslip(row) {
  if (!row) return null
  return {
    id:                  row.id,
    memberId:            row.member_id,
    periodStart:         row.period_start,
    periodEnd:           row.period_end,
    earnings:            row.earnings,
    deductions:          row.deductions,
    gross:               row.gross,
    net:                 row.net,
    allocations:         row.allocations,
    interestEarned:              row.interest_earned,
    philanthropyInterestEarned:  row.allocations?.philanthropyInterest ?? 0,
    loanOutstandingAfter:        row.loan_outstanding_after,
    balancesAfter:               row.balances_after,
    creditScore:                 row.credit_score,
    createdAt:                   row.created_at,
    totalDeductions:             row.total_deductions,
    status:                      row.status ?? 'settled',
    bonusPotential:              row.bonus_potential ?? 0,
    pendingTransactions:         row.pending_transactions ?? [],
    creditDelta:                 row.credit_delta ?? 0,
    // W6: stage the payslip was earned at; null on pre-W6 rows (rendered as economist)
    stage:                       row.stage ?? null,
  }
}

function mapReward(row) {
  if (!row) return null
  return {
    id:       row.id,
    familyId: row.family_id,
    title:    row.title,
    category: row.category,
    price:    row.cost,
    isActive: row.is_active,
    emoji:    row.emoji,
  }
}

function mapRewardRequest(row) {
  if (!row) return null
  return {
    id:          row.id,
    memberId:    row.member_id,
    rewardId:    row.reward_id,
    rewardTitle: row.reward_title,
    amount:      row.amount,
    status:      row.status,
    requestedAt: row.requested_at,
    resolvedAt:  row.resolved_at,
  }
}

function mapUtilityCharge(row) {
  if (!row) return null
  return {
    id:       row.id,
    memberId: row.member_id,
    date:     row.date,
    reason:   row.reason,
    amount:   row.amount,
  }
}

// ── Error helper ─────────────────────────────────────────────────────────────

function throwIfError({ error }) {
  if (error) throw new Error(error.message)
}

// ── Alerts (W7) ───────────────────────────────────────────────────────────────

function mapAlert(row) {
  if (!row) return null
  return {
    id:          row.id,
    familyId:    row.family_id,
    memberId:    row.member_id,
    targetRole:  row.target_role,
    type:        row.type,
    title:       row.title,
    body:        row.body,
    data:        row.data,
    channels:    row.channels ?? [],
    dedupeKey:   row.dedupe_key,
    readAt:      row.read_at,
    dismissedAt: row.dismissed_at,
    createdAt:   row.created_at,
  }
}

/**
 * Insert an alert. Duplicate-prone alerts pass `dedupeKey` — the unique index
 * plus ON CONFLICT DO NOTHING (upsert ignoreDuplicates) makes the write
 * race-free across two parent devices, no check-then-insert.
 */
export async function createAlert({
  memberId = null, targetRole, type, title, body = null,
  data = null, channels = ['bell'], dedupeKey = null, familyId = null,
}) {
  throwIfError(await supabase.from('alerts').upsert({
    id:          crypto.randomUUID(),
    family_id:   familyId ?? getFamilyId(),
    member_id:   memberId,
    target_role: targetRole,
    type, title, body, data, channels,
    dedupe_key:  dedupeKey,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true }))
}

/** A failed alert insert must never fail the operation that triggered it. */
export async function tryCreateAlert(alert) {
  try { await createAlert(alert) } catch (e) { console.warn('[Artha] alert write failed:', e) }
}

/** Currency formatter for alert copy written outside React (no useCurrency hook). */
async function alertFmt() {
  let currency = DEFAULT_CONFIG.currency
  try {
    const { data } = await supabase.from('families').select('config').eq('id', getFamilyId()).single()
    currency = data?.config?.currency ?? currency
  } catch { /* fall back to default */ }
  return (amount) => formatCurrency(amount, currency)
}

/**
 * Feed for the bell + banners. Parents see parent/all alerts for the family;
 * children see child/all alerts addressed to them or family-wide.
 */
export async function getAlerts({ role, memberId = null, limit = 50 }) {
  let q = supabase.from('alerts').select('*')
    .eq('family_id', getFamilyId())
    .order('created_at', { ascending: false })
    .limit(limit)
  q = role === 'parent'
    ? q.in('target_role', ['parent', 'all'])
    : q.in('target_role', ['child', 'all']).or(`member_id.eq.${memberId},member_id.is.null`)
  const { data, error } = await q
  throwIfError({ error })
  return (data ?? []).map(mapAlert)
}

export async function markAlertRead(id) {
  throwIfError(await supabase.from('alerts')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id))
}

export async function markAllAlertsRead(ids) {
  if (!ids?.length) return
  throwIfError(await supabase.from('alerts')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null))
}

/** Banner dismissal also marks read so the bell badge doesn't keep counting it. */
export async function dismissAlert(id) {
  const now = new Date().toISOString()
  throwIfError(await supabase.from('alerts')
    .update({ dismissed_at: now, read_at: now })
    .eq('id', id))
}

/**
 * Settling a payslip retires its prompt alerts: payslip_ready /
 * payslip_overdue rows for that payslip are marked read + dismissed so the
 * banner disappears and the bell stops counting them.
 */
export async function markPayslipPromptAlertsHandled(payslipId) {
  const now = new Date().toISOString()
  await supabase.from('alerts')
    .update({ read_at: now, dismissed_at: now })
    .in('type', ['payslip_ready', 'payslip_overdue'])
    .contains('data', { payslipId })
    .is('dismissed_at', null)
}

/**
 * Prune alerts older than 30 days. Runs on app load, at most once per 24h per
 * device (localStorage guard). No cron. Failure is silent — pruning is hygiene.
 */
export async function deleteOldAlerts() {
  try {
    const KEY = 'artha_alerts_pruned_at'
    const last = Number(localStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 24 * 60 * 60 * 1000) return
    localStorage.setItem(KEY, String(Date.now()))
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('alerts').delete().eq('family_id', getFamilyId()).lt('created_at', cutoff)
  } catch (e) {
    console.warn('[Artha] alert pruning failed:', e)
  }
}

// ── Family ──────────────────────────────────────────────────────────────────

export async function getFamily(id) {
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code === 'PGRST116') return null // not found
  throwIfError({ error })
  return mapFamily(data)
}

export async function updateFamilyConfig(familyId, config) {
  throwIfError(await supabase
    .from('families')
    .update({ config })
    .eq('id', familyId))
}

export async function updateTaxFund(familyId, balance, history) {
  throwIfError(await supabase
    .from('families')
    .update({ tax_fund_balance: balance, tax_fund_history: history })
    .eq('id', familyId))
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function getMembers(familyId) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('family_id', familyId)
  throwIfError({ error })
  return (data ?? []).map(mapMember)
}

export async function getMember(id) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code === 'PGRST116') return null
  throwIfError({ error })
  return mapMember(data)
}

export async function updateMember(id, changes) {
  // Map camelCase keys to snake_case
  const row = {}
  if ('name' in changes)       row.name        = changes.name
  if ('avatar' in changes)     row.avatar       = changes.avatar
  if ('role' in changes)       row.role         = changes.role
  if ('pin' in changes)        row.pin     = changes.pin
  if ('baseSalary' in changes) row.base_salary  = changes.baseSalary
  if ('accounts' in changes) {
    validateAccounts(changes.accounts)
    row.accounts = changes.accounts
  }
  if ('config' in changes)     row.config       = changes.config
  if ('creditScore' in changes) row.credit_score = changes.creditScore
  if ('lastCreditPopupPeriod' in changes) row.last_credit_popup_period = changes.lastCreditPopupPeriod
  throwIfError(await supabase.from('members').update(row).eq('id', id))
}

function validateAccounts(accounts) {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
  if (!isNum(accounts.spending) || !isNum(accounts.savings) || !isNum(accounts.philanthropy))
    throw new Error('validateAccounts: balance fields must be finite numbers')
  if (!Array.isArray(accounts.subGoals))
    throw new Error('validateAccounts: subGoals must be an array')
  if (accounts.loan != null && typeof accounts.loan !== 'object')
    throw new Error('validateAccounts: loan must be null or object')
}

export async function updateMemberAccounts(memberId, accounts) {
  validateAccounts(accounts)
  throwIfError(await supabase
    .from('members')
    .update({ accounts })
    .eq('id', memberId))
}

// ── Chores ───────────────────────────────────────────────────────────────────

export async function getChores(familyId) {
  const { data, error } = await supabase
    .from('chores')
    .select('*')
    .eq('family_id', familyId)
  throwIfError({ error })
  return (data ?? []).map(mapChore)
}

export async function addChore(chore) {
  const row = {
    id:           crypto.randomUUID(),
    family_id:    chore.familyId,
    title:        chore.title,
    type:         chore.type,
    recurrence:   chore.recurrence,
    days_per_week: chore.daysPerWeek ?? null,
    days_of_week:  chore.daysOfWeek ?? null,
    value:        chore.value ?? 0,
    assigned_to:  chore.assignedTo ?? [],
    is_active:    chore.isActive ?? true,
  }
  const { data, error } = await supabase.from('chores').insert(row).select().single()
  throwIfError({ error })
  return mapChore(data)
}

export async function updateChore(id, changes) {
  const row = {}
  if ('title' in changes)      row.title         = changes.title
  if ('type' in changes)       row.type          = changes.type
  if ('recurrence' in changes) row.recurrence    = changes.recurrence
  if ('daysPerWeek' in changes) row.days_per_week = changes.daysPerWeek
  if ('daysOfWeek' in changes)  row.days_of_week  = changes.daysOfWeek
  if ('value' in changes)      row.value         = changes.value
  if ('assignedTo' in changes) row.assigned_to   = changes.assignedTo
  if ('isActive' in changes)   row.is_active     = changes.isActive
  throwIfError(await supabase.from('chores').update(row).eq('id', id))
}

export async function toggleChoreActive(id, current) {
  throwIfError(await supabase
    .from('chores')
    .update({ is_active: !current })
    .eq('id', id))
}

export async function deleteChore(id) {
  throwIfError(await supabase
    .from('chores')
    .update({ is_active: false })
    .eq('id', id))
}

// ── Chore Logs ───────────────────────────────────────────────────────────────

export async function getChoreLogsForDate(memberId, date) {
  const { data, error } = await supabase
    .from('chore_logs')
    .select('*')
    .eq('member_id', memberId)
    .eq('date', date)
  throwIfError({ error })
  return (data ?? []).map(mapChoreLog)
}

export async function getChoreLogsForPeriod(memberId, startDate, endDate) {
  const { data, error } = await supabase
    .from('chore_logs')
    .select('*')
    .eq('member_id', memberId)
    .gte('date', startDate)
    .lte('date', endDate)
  throwIfError({ error })
  return (data ?? []).map(mapChoreLog)
}

export async function getPendingLogsForMembers(memberIds) {
  if (!memberIds.length) return []
  const { data, error } = await supabase
    .from('chore_logs')
    .select('*')
    .eq('status', 'pending')
    .in('member_id', memberIds)
  throwIfError({ error })
  return (data ?? []).map(mapChoreLog)
}

export async function addChoreLog(chore) {
  const row = {
    id:           crypto.randomUUID(),
    chore_id:     chore.choreId,
    member_id:    chore.memberId,
    date:         chore.date,
    status:       'pending',
    completed_at: Date.now(),
    approved_at:  null,
  }
  throwIfError(await supabase.from('chore_logs').insert(row))

  // chores_all_done fires at LOG time — when this log completes today's
  // mandatory set. Pending counts as done (same principle as credit score:
  // parent approval delay must not penalise the child); a later rejection is
  // corrected by the chore_rejected alert.
  try {
    if (chore.date !== today()) return
    const allChores = await getChores(getFamilyId())
    const due = getDueChoresForMember(allChores, chore.memberId)
    if (!due.length) return
    const logs = await getChoreLogsForDate(chore.memberId, chore.date)
    const allDone = due.every(c => logs.some(l =>
      l.choreId === c.id && (l.status === 'approved' || l.status === 'pending')))
    if (!allDone) return
    await createAlert({
      memberId:  chore.memberId,
      targetRole: 'child',
      type:      'chores_all_done',
      title:     '✅ All done for today! Great work.',
      channels:  ['banner', 'bell'],
      dedupeKey: `alldone:${chore.memberId}:${chore.date}`,
    })
  } catch (e) {
    console.warn('[Artha] alert write failed:', e)
  }
}

export async function approveChoreLog(id) {
  const { data, error } = await supabase
    .from('chore_logs')
    .update({ status: 'approved', approved_at: Date.now() })
    .eq('id', id)
    .select()
    .single()
  throwIfError({ error })
  try {
    const { data: chore } = await supabase
      .from('chores').select('title').eq('id', data.chore_id).single()
    await createAlert({
      memberId:  data.member_id,
      targetRole: 'child',
      type:      'chore_approved',
      title:     `✅ ${chore?.title ?? 'Chore'} approved!`,
      data:      { choreId: data.chore_id, logId: id },
      channels:  ['bell'],
    })
  } catch (e) {
    console.warn('[Artha] alert write failed:', e)
  }
}

export async function rejectChoreLog(id) {
  const { data, error } = await supabase
    .from('chore_logs')
    .update({ status: 'rejected', approved_at: Date.now() })
    .eq('id', id)
    .select()
    .single()
  throwIfError({ error })
  try {
    const { data: chore } = await supabase
      .from('chores').select('title').eq('id', data.chore_id).single()
    await createAlert({
      memberId:  data.member_id,
      targetRole: 'child',
      type:      'chore_rejected',
      title:     `❌ ${chore?.title ?? 'Chore'} was not approved.`,
      data:      { choreId: data.chore_id, logId: id },
      channels:  ['bell'],
    })
  } catch (e) {
    console.warn('[Artha] alert write failed:', e)
  }
}

export async function updateChoreLog(id, changes) {
  const row = {}
  if ('status' in changes)     row.status      = changes.status
  if ('approvedAt' in changes) row.approved_at = changes.approvedAt
  throwIfError(await supabase.from('chore_logs').update(row).eq('id', id))
}

// ── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(memberId, limit = 50) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId)
    .order('date', { ascending: false })
    .limit(limit)
  throwIfError({ error })
  return (data ?? []).map(mapTransaction)
}

export async function getTransactionsForPeriod(memberId, periodStart, periodEnd) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date', { ascending: false })
  throwIfError({ error })
  return (data ?? []).map(mapTransaction)
}

export async function addTransaction(tx) {
  const row = {
    id:          tx.id ?? crypto.randomUUID(),
    member_id:   tx.memberId,
    type:        tx.type,
    amount:      tx.amount,
    description: tx.description,
    date:        tx.date,
    related_id:  tx.relatedId ?? null,
  }
  throwIfError(await supabase.from('transactions').insert(row))
}

// ── Rewards ──────────────────────────────────────────────────────────────────

export async function getRewards(familyId) {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('family_id', familyId)
    .eq('is_active', true)
  throwIfError({ error })
  return (data ?? []).map(mapReward)
}

export async function getAllRewards(familyId) {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('family_id', familyId)
  throwIfError({ error })
  return (data ?? []).map(mapReward)
}

export async function addReward(reward) {
  const row = {
    id:        reward.id ?? crypto.randomUUID(),
    family_id: reward.familyId,
    title:     reward.title,
    category:  reward.category,
    cost:      reward.price,
    is_active: reward.isActive ?? true,
    emoji:     reward.emoji ?? null,
  }
  throwIfError(await supabase.from('rewards').insert(row))
}

export async function updateReward(id, changes) {
  const row = {}
  if ('title' in changes)    row.title     = changes.title
  if ('category' in changes) row.category  = changes.category
  if ('price' in changes)    row.cost      = changes.price
  if ('isActive' in changes) row.is_active = changes.isActive
  if ('emoji' in changes)    row.emoji     = changes.emoji
  throwIfError(await supabase.from('rewards').update(row).eq('id', id))
}

export async function deleteReward(id) {
  throwIfError(await supabase
    .from('rewards')
    .update({ is_active: false })
    .eq('id', id))
}

// ── Reward Requests ───────────────────────────────────────────────────────────

export async function addRewardRequest(req) {
  const row = {
    id:           crypto.randomUUID(),
    member_id:    req.memberId,
    reward_id:    req.rewardId,
    reward_title: req.rewardTitle,
    amount:       req.amount,
    status:       'pending',
    requested_at: Date.now(),
    resolved_at:  null,
  }
  throwIfError(await supabase.from('reward_requests').insert(row))
}

export async function getRewardRequests(memberId) {
  const { data, error } = await supabase
    .from('reward_requests')
    .select('*')
    .eq('member_id', memberId)
    .order('requested_at', { ascending: false })
  throwIfError({ error })
  return (data ?? []).map(mapRewardRequest)
}

export async function getPendingRewardRequests(memberIds) {
  if (!memberIds.length) return []
  const { data, error } = await supabase
    .from('reward_requests')
    .select('*')
    .eq('status', 'pending')
    .in('member_id', memberIds)
  throwIfError({ error })
  return (data ?? []).map(mapRewardRequest)
}

export async function rejectRewardRequest(id) {
  const { data, error } = await supabase
    .from('reward_requests')
    .update({ status: 'rejected', resolved_at: Date.now() })
    .eq('id', id)
    .select()
    .single()
  throwIfError({ error })
  await tryCreateAlert({
    memberId:  data.member_id,
    targetRole: 'child',
    type:      'reward_rejected',
    title:     `❌ ${data.reward_title ?? 'Reward'} request was declined.`,
    data:      { requestId: id },
    channels:  ['bell'],
  })
}

// ── Compound operations ───────────────────────────────────────────────────────

export async function approveBonusChoreLog(logId) {
  // No immediate credit — bonus chore earnings are included in the next payslip
  await approveChoreLog(logId)
}

// Parent marks a chore as done on behalf of a child — pre-approved, no pending state.
// Idempotent: if an approved log already exists for this chore+date, does nothing.
export async function parentCompleteChore(choreId, memberId, date) {
  // Check for existing log
  const { data: existing } = await supabase
    .from('chore_logs')
    .select('id, status')
    .eq('chore_id', choreId)
    .eq('member_id', memberId)
    .eq('date', date)
    .maybeSingle()

  if (existing?.status === 'approved') return // already done
  if (existing) {
    // Upgrade pending/rejected to approved
    await approveChoreLog(existing.id)
    return
  }

  // Insert directly as approved
  throwIfError(await supabase.from('chore_logs').insert({
    id:           crypto.randomUUID(),
    chore_id:     choreId,
    member_id:    memberId,
    date,
    status:       'approved',
    completed_at: Date.now(),
    approved_at:  Date.now(),
  }))
}

// Undo: parent removes their own chore completion for a child
export async function parentUndoChore(choreId, memberId, date) {
  await supabase
    .from('chore_logs')
    .delete()
    .eq('chore_id', choreId)
    .eq('member_id', memberId)
    .eq('date', date)
}

export async function approveRewardRequest(requestId, memberId, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  if (member.accounts.spending < amount) throw new Error('Insufficient balance')

  const { data: reqRow } = await supabase
    .from('reward_requests').select('*').eq('id', requestId).single()

  await supabase
    .from('reward_requests')
    .update({ status: 'approved', resolved_at: Date.now() })
    .eq('id', requestId)
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: member.accounts.spending - amount,
  })
  await addTransaction({
    id: crypto.randomUUID(),
    memberId,
    type: 'reward',
    amount: -amount,
    description: `Reward: ${reqRow?.reward_title ?? 'Reward'}`,
    date: new Date().toISOString().slice(0, 10),
    relatedId: requestId,
  })

  // reward_approved banner+bell (absorbs the old ChildShell toast)
  try {
    const fmt = await alertFmt()
    await createAlert({
      memberId,
      targetRole: 'child',
      type:      'reward_approved',
      title:     `🎉 ${reqRow?.reward_title ?? 'Reward'} approved! ${fmt(amount)} deducted from wallet.`,
      data:      { requestId, amount },
      channels:  ['banner', 'bell'],
    })
  } catch (e) {
    console.warn('[Artha] alert write failed:', e)
  }
}

// Parent buys a reward directly on behalf of a child (no request flow)
export async function parentBuyReward(memberId, rewardId, rewardTitle, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  if ((member.accounts.spending ?? 0) < amount) throw new Error('Insufficient wallet balance')
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: member.accounts.spending - amount,
  })
  await addTransaction({
    id: crypto.randomUUID(),
    memberId,
    type: 'reward',
    amount: -amount,
    description: `Reward: ${rewardTitle}`,
    date: new Date().toISOString().slice(0, 10),
    relatedId: rewardId,
  })
}

// ── Payslips ─────────────────────────────────────────────────────────────────

export async function getPayslips(memberId) {
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('member_id', memberId)
    .order('period_end', { ascending: false })
  throwIfError({ error })
  return (data ?? []).map(mapPayslip)
}

export async function getLatestPayslip(memberId) {
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('member_id', memberId)
    .order('period_end', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code === 'PGRST116') return null
  throwIfError({ error })
  return mapPayslip(data)
}

export async function getPayslipForPeriod(memberId, periodEnd) {
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('member_id', memberId)
    .eq('period_end', periodEnd)
    .single()
  if (error && error.code === 'PGRST116') return null
  throwIfError({ error })
  return mapPayslip(data)
}

export async function addPayslip(payslip) {
  const row = {
    id:                    payslip.id ?? crypto.randomUUID(),
    member_id:             payslip.memberId,
    period_start:          payslip.periodStart,
    period_end:            payslip.periodEnd,
    earnings:              payslip.earnings,
    deductions:            payslip.deductions,
    gross:                 payslip.gross,
    net:                   payslip.net,
    allocations:           {
      ...(payslip.allocations ?? {}),
      philanthropyInterest: payslip.philanthropyInterestEarned ?? 0,
    },
    total_deductions:      payslip.totalDeductions,
    interest_earned:       payslip.interestEarned,
    loan_outstanding_after: payslip.loanOutstandingAfter,
    balances_after:        payslip.balancesAfter,
    credit_score:          payslip.creditScore,
    created_at:            payslip.createdAt ?? new Date().toISOString(),
    status:                payslip.status ?? 'draft',
    bonus_potential:       payslip.bonusPotential ?? 0,
    pending_transactions:  payslip.pendingTransactions ?? [],
    credit_delta:          payslip.creditDelta ?? 0,
    stage:                 payslip.stage ?? null,
  }
  throwIfError(await supabase.from('payslips').insert(row))
}

/**
 * First-week checklist progress (W8) — all derived from existing data, no new
 * table. claimedMemberIds: children who have logged in on a device;
 * anyChoreLog / anyChoreApproved: family-wide firsts.
 */
export async function getFirstWeekProgress(memberIds) {
  if (!memberIds?.length) return { claimedMemberIds: [], anyChoreLog: false, anyChoreApproved: false }
  const [claims, anyLog, anyApproved] = await Promise.all([
    supabase.from('device_claims').select('member_id').in('member_id', memberIds),
    supabase.from('chore_logs').select('id').in('member_id', memberIds).limit(1),
    supabase.from('chore_logs').select('id').in('member_id', memberIds).eq('status', 'approved').limit(1),
  ])
  return {
    claimedMemberIds: [...new Set((claims.data ?? []).map(r => r.member_id))],
    anyChoreLog:      (anyLog.data ?? []).length > 0,
    anyChoreApproved: (anyApproved.data ?? []).length > 0,
  }
}

/**
 * Settled payslip count per member — drives stage derivation (W6).
 * Legacy rows predating the status column have NULL status; mapPayslip treats
 * those as settled, so the query must too.
 */
export async function getSettledPayslipCounts(memberIds) {
  if (!memberIds?.length) return {}
  const counts = Object.fromEntries(memberIds.map(id => [id, 0]))
  const { data, error } = await supabase
    .from('payslips')
    .select('member_id, status')
    .in('member_id', memberIds)
    .or('status.eq.settled,status.is.null')
  throwIfError({ error })
  for (const row of data ?? []) counts[row.member_id] = (counts[row.member_id] ?? 0) + 1
  return counts
}

export async function rpcSettlePayslip(payslipId) {
  const { data, error } = await supabase.rpc('settle_payslip', { p_payslip_id: payslipId })
  throwIfError({ error })
  return data
}

export async function getPayslip(payslipId) {
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .eq('id', payslipId)
    .single()
  if (error && error.code === 'PGRST116') return null
  throwIfError({ error })
  return mapPayslip(data)
}

export async function updatePayslipStatus(payslipId, status) {
  throwIfError(await supabase
    .from('payslips')
    .update({ status })
    .eq('id', payslipId))
}

export async function updatePayslipCreditScore(payslipId, score) {
  throwIfError(await supabase
    .from('payslips')
    .update({ credit_score: score })
    .eq('id', payslipId))
}

// Returns draft payslips from previous periods (genuinely forgotten, not current-period pre-runs)
export async function getOverdueDrafts(memberIds, currentPeriodEnd) {
  if (!memberIds.length) return []
  const { data, error } = await supabase
    .from('payslips')
    .select('*')
    .in('member_id', memberIds)
    .eq('status', 'draft')
    .lt('period_end', currentPeriodEnd)
  throwIfError({ error })
  return (data ?? []).map(mapPayslip)
}

// ── Utility Charges ──────────────────────────────────────────────────────────

export async function getUtilityCharges(memberId, weekStart, weekEnd) {
  const { data, error } = await supabase
    .from('utility_charges')
    .select('*')
    .eq('member_id', memberId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
  throwIfError({ error })
  return (data ?? []).map(mapUtilityCharge)
}

export async function getAllPendingUtilityCharges(memberId) {
  const { data, error } = await supabase
    .from('utility_charges')
    .select('*')
    .eq('member_id', memberId)
  throwIfError({ error })
  return (data ?? []).map(mapUtilityCharge)
}

export async function addUtilityCharge(charge) {
  const row = {
    id:        charge.id ?? crypto.randomUUID(),
    member_id: charge.memberId,
    date:      charge.date,
    reason:    charge.reason,
    amount:    charge.amount,
  }
  throwIfError(await supabase.from('utility_charges').insert(row))
}

// ── Parent Money Actions ──────────────────────────────────────────────────────

export async function giveBonus(memberId, amount, reason) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')

  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: member.accounts.spending + amount,
  })
  await addTransaction({
    id: crypto.randomUUID(),
    memberId,
    type: 'parent_bonus',
    amount,
    description: reason || 'Bonus from parent',
    date: today(),
    relatedId: null,
  })
}

export async function giveLoan(memberId, amount, weeklyRepayment, interestFree = false) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')

  const currentLoan = member.accounts.loan ?? { outstanding: 0, weeklyRepayment: 0 }
  const effectiveRepayment    = Math.max(weeklyRepayment, currentLoan.weeklyRepayment ?? 0)
  const effectiveInterestFree = interestFree && (currentLoan.interestFree !== false)

  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: member.accounts.spending + amount,
    loan: {
      outstanding:     currentLoan.outstanding + amount,
      weeklyRepayment: effectiveRepayment,
      interestFree:    effectiveInterestFree,
    },
  })
  await addTransaction({
    id: crypto.randomUUID(),
    memberId,
    type: 'loan_credit',
    amount,
    description: `Loan from parent (₹${weeklyRepayment}/wk repayment)`,
    date: today(),
    relatedId: null,
  })
}

export async function makeEarlyRepayment(memberId, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const loan = member.accounts?.loan
  if (!loan || loan.outstanding <= 0) throw new Error('No active loan')

  const actual         = Math.min(amount, loan.outstanding, member.accounts.spending)
  if (actual <= 0)     throw new Error('Insufficient spending balance')
  const newOutstanding = loan.outstanding - actual

  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: member.accounts.spending - actual,
    loan: newOutstanding > 0
      ? { ...loan, outstanding: newOutstanding }
      : null,
  })
  await addTransaction({
    id: crypto.randomUUID(),
    memberId,
    type: newOutstanding === 0 ? 'loan_cleared' : 'loan_repay',
    amount: -actual,
    description: newOutstanding === 0
      ? 'Early repayment — loan fully cleared!'
      : `Early repayment (${newOutstanding} remaining)`,
    date: today(),
    relatedId: null,
  })
  await updateCreditScore(memberId, newOutstanding === 0 ? 20 : 5)

  return newOutstanding
}

export async function updateLoanRepayment(memberId, weeklyRepayment) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const loan = member.accounts?.loan
  if (!loan) throw new Error('No active loan')
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    loan: { ...loan, weeklyRepayment },
  })
}

export async function addMember(memberData) {
  const row = {
    id:         memberData.id ?? crypto.randomUUID(),
    family_id:  memberData.familyId,
    name:       memberData.name,
    avatar:     memberData.avatar ?? '👤',
    role:       memberData.role,
    pin:   memberData.pin,
    base_salary: memberData.baseSalary ?? 0,
    accounts:   memberData.accounts ?? { spending: 0, savings: 0, philanthropy: 0, subGoals: [], loan: null },
    config:     memberData.config ?? null,
    credit_score: memberData.creditScore ?? 500,
  }
  const { data, error } = await supabase.from('members').insert(row).select().single()
  throwIfError({ error })
  const member = mapMember(data)

  // W6: while the family has skipped the guided period, new children start at
  // the overridden stage — apply the cumulative patches immediately.
  if (member.role === 'child') {
    try {
      const family = await getFamily(member.familyId)
      if (family?.config?.stageOverride) {
        member.config = await applyStagePatches(member, family.config.stageOverride)
      }
    } catch (e) {
      console.warn('[Artha] stage patch on addMember failed:', e)
    }
  }
  return member
}

export async function addLoanInterest(memberId, interestRate) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const loan = member.accounts?.loan
  if (!loan || loan.outstanding <= 0) throw new Error('No outstanding loan')

  const interest = Math.round(loan.outstanding * interestRate)
  if (interest <= 0) return

  await updateMemberAccounts(memberId, {
    ...member.accounts,
    loan: { ...loan, outstanding: loan.outstanding + interest },
  })
  await addTransaction({
    id: crypto.randomUUID(),
    memberId,
    type: 'loan_interest',
    amount: interest,
    description: `Loan interest (${+(interestRate * 100).toFixed(2)}%)`,
    date: today(),
    relatedId: null,
  })
}

// ── Member Requests (donations + sub-goal withdrawals) ────────────────────────

function mapMemberRequest(row) {
  if (!row) return null
  return {
    id:          row.id,
    familyId:    row.family_id,
    memberId:    row.member_id,
    type:        row.type,
    status:      row.status,
    amount:      row.amount,
    description: row.description,
    metadata:    row.metadata,
    requestedAt: row.requested_at,
    resolvedAt:  row.resolved_at,
  }
}

export async function addMemberRequest(req) {
  throwIfError(await supabase.from('member_requests').insert({
    id:           req.id ?? crypto.randomUUID(),
    family_id:    req.familyId,
    member_id:    req.memberId,
    type:         req.type,
    status:       'pending',
    amount:       req.amount,
    description:  req.description,
    metadata:     req.metadata ?? null,
    requested_at: req.requestedAt ?? Date.now(),
  }))
}

export async function getPendingMemberRequests(memberIds) {
  if (!memberIds.length) return []
  const { data, error } = await supabase
    .from('member_requests')
    .select('*')
    .in('member_id', memberIds)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
  throwIfError({ error })
  return (data ?? []).map(mapMemberRequest)
}

export async function resolveMemberRequest(id, status) {
  throwIfError(await supabase
    .from('member_requests')
    .update({ status, resolved_at: Date.now() })
    .eq('id', id))
}

// ── Donate from philanthropy (approve or parent-direct) ───────────────────────

async function performDonation(memberId, amount, charityName) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const current = member.accounts.philanthropy ?? 0
  if (amount > current) throw new Error(`Insufficient philanthropy balance (${current} available)`)

  await updateMemberAccounts(memberId, {
    ...member.accounts,
    philanthropy: current - amount,
  })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'withdrawal', amount: -amount,
    description: `Donation to ${charityName}`,
    date: today(), relatedId: null,
  })
}

export async function approveDonation(requestId, memberId, amount, charityName) {
  await performDonation(memberId, amount, charityName)
  await resolveMemberRequest(requestId, 'approved')
}

export async function parentDonate(memberId, amount, charityName) {
  await performDonation(memberId, amount, charityName)
}

// ── Sub-goal withdrawal (approve or parent-direct) ────────────────────────────
// metadata: { subGoalId, subGoalName, destination: 'spending'|'philanthropy'|'subgoal',
//             destinationSubGoalId?, deleteGoal }

async function performSubGoalWithdrawal(memberId, amount, metadata) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')

  const subGoals = member.accounts.subGoals ?? []
  const goal     = subGoals.find(sg => sg.id === metadata.subGoalId)
  if (!goal) throw new Error('Sub-goal not found')
  if (amount > goal.balance) throw new Error(`Insufficient sub-goal balance (${goal.balance} available)`)

  // Deduct from sub-goal
  let updatedGoals = subGoals.map(sg =>
    sg.id === metadata.subGoalId ? { ...sg, balance: sg.balance - amount } : sg
  )
  // Delete if empty and requested
  if (metadata.deleteGoal && updatedGoals.find(sg => sg.id === metadata.subGoalId)?.balance === 0) {
    updatedGoals = updatedGoals.filter(sg => sg.id !== metadata.subGoalId)
  }

  const newAccounts = { ...member.accounts, subGoals: updatedGoals }

  // Credit destination
  let txDescription = ''
  if (metadata.destination === 'spending') {
    newAccounts.spending = (member.accounts.spending ?? 0) + amount
    txDescription = `Withdraw from "${goal.name}" to spending`
  } else if (metadata.destination === 'philanthropy') {
    newAccounts.philanthropy = (member.accounts.philanthropy ?? 0) + amount
    txDescription = `Withdraw from "${goal.name}" to philanthropy`
  } else if (metadata.destination === 'subgoal' && metadata.destinationSubGoalId) {
    newAccounts.subGoals = newAccounts.subGoals.map(sg =>
      sg.id === metadata.destinationSubGoalId ? { ...sg, balance: sg.balance + amount } : sg
    )
    const destGoal = subGoals.find(sg => sg.id === metadata.destinationSubGoalId)
    txDescription = `Transfer from "${goal.name}" to "${destGoal?.name ?? 'goal'}"`
  } else if (metadata.destination === 'cash') {
    txDescription = `Cash withdrawal from "${goal.name}"`
  } else if (metadata.destination === 'bank') {
    txDescription = `Bank transfer from "${goal.name}"`
  }

  await updateMemberAccounts(memberId, newAccounts)
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'withdrawal', amount: -amount,
    description: txDescription,
    date: today(), relatedId: null,
  })
}

export async function approveSubGoalWithdrawal(requestId, memberId, amount, metadata) {
  await performSubGoalWithdrawal(memberId, amount, metadata)
  await resolveMemberRequest(requestId, 'approved')
}

export async function parentSubGoalWithdrawal(memberId, amount, metadata) {
  await performSubGoalWithdrawal(memberId, amount, metadata)
}

// Parent deposits from wallet into savings on child's behalf
export async function parentDepositToSavings(memberId, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const spending = member.accounts.spending ?? 0
  if (amount > spending) throw new Error(`Insufficient wallet balance (${spending} available)`)
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: spending - amount,
    savings:  (member.accounts.savings ?? 0) + amount,
  })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'deposit', amount: -amount,
    description: 'Wallet → savings (parent)',
    date: today(), relatedId: null,
  })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'deposit', amount,
    description: 'Savings deposit from wallet (parent)',
    date: today(), relatedId: null,
  })
}

// Parent deposits from wallet into a sub-goal on child's behalf
export async function parentDepositToSubGoal(memberId, subGoalId, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const spending = member.accounts.spending ?? 0
  if (amount > spending) throw new Error(`Insufficient wallet balance (${spending} available)`)
  const subGoals = member.accounts.subGoals ?? []
  const sg = subGoals.find(g => g.id === subGoalId)
  if (!sg) throw new Error('Sub-goal not found')
  const deposit = Math.min(amount, (sg.target ?? Infinity) - (sg.balance ?? 0))
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    spending: spending - deposit,
    subGoals: subGoals.map(g => g.id === subGoalId ? { ...g, balance: (g.balance ?? 0) + deposit } : g),
  })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'deposit', amount: deposit,
    description: `Deposit → ${sg.name} (parent)`,
    date: today(), relatedId: subGoalId,
  })
}

// Parent direct cash/bank withdrawal from wallet — no approval queue
export async function parentWalletWithdrawal(memberId, amount, destination) {
  await performSpendingWithdrawal(memberId, amount, destination)
}

// ── Spending wallet cash / bank withdrawal ────────────────────────────────────
async function performSpendingWithdrawal(memberId, amount, destination) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const spending = member.accounts.spending ?? 0
  if (amount > spending) throw new Error(`Insufficient wallet balance (${spending} available)`)
  await updateMemberAccounts(memberId, { ...member.accounts, spending: spending - amount })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'withdrawal', amount: -amount,
    description: destination === 'bank' ? 'Bank transfer from wallet' : 'Cash withdrawal from wallet',
    date: today(), relatedId: null,
  })
}

export async function approveSpendingWithdrawal(requestId, memberId, amount, destination) {
  await performSpendingWithdrawal(memberId, amount, destination)
  await resolveMemberRequest(requestId, 'approved')

  // cash_approved bell — cash destination only (bank transfers stay silent per the launch catalog)
  if (destination === 'cash') {
    try {
      const fmt = await alertFmt()
      await createAlert({
        memberId,
        targetRole: 'child',
        type:      'cash_approved',
        title:     `💵 Cash withdrawal of ${fmt(amount)} approved — collect from your parent.`,
        data:      { requestId, amount },
        channels:  ['bell'],
      })
    } catch (e) {
      console.warn('[Artha] alert write failed:', e)
    }
  }
}

// ── Direct savings → spending wallet transfer (no parent approval needed) ─────
export async function transferSavingsToWallet(memberId, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const savings = member.accounts.savings ?? 0
  if (amount > savings) throw new Error(`Insufficient savings (${savings} available)`)
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    savings:  savings - amount,
    spending: (member.accounts.spending ?? 0) + amount,
  })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'withdrawal', amount: -amount,
    description: 'Savings → spending wallet',
    date: today(), relatedId: null,
  })
}

// ── Savings withdrawal (parent-approved, cash or bank) ────────────────────────
export async function approveSavingsWithdrawal(requestId, memberId, amount) {
  const member = await getMember(memberId)
  if (!member) throw new Error('Member not found')
  const savings = member.accounts.savings ?? 0
  if (amount > savings) throw new Error(`Insufficient savings (${savings} available)`)
  await updateMemberAccounts(memberId, {
    ...member.accounts,
    savings:  savings - amount,
    spending: (member.accounts.spending ?? 0) + amount,
  })
  await addTransaction({
    id: crypto.randomUUID(), memberId,
    type: 'withdrawal', amount: -amount,
    description: 'Savings withdrawal to wallet',
    date: today(), relatedId: null,
  })
  await resolveMemberRequest(requestId, 'approved')
}

// ── Stage patches (W6) ────────────────────────────────────────────────────────

/**
 * Apply the cumulative stage patches through `throughStage` to a child's
 * member.config, skipping keys in member.config.configTouched. The single
 * shared write path for all three callers: settle-time advancement,
 * "Skip the guided period", and addMember under stageOverride.
 * Returns the new config (or the existing one when nothing changed).
 */
export async function applyStagePatches(member, throughStage) {
  const config = member.config ?? {}
  const patch  = buildStagePatch(config, throughStage)
  if (Object.keys(patch).length === 0) return member.config ?? null
  const newConfig = { ...config, ...patch }
  await updateMemberConfig(member.id, newConfig)
  return newConfig
}

/**
 * One-shot W6 self-migration for pre-W6 families. Stage-gated keys used to live
 * in family.config; copy each child's EFFECTIVE values (family.config first,
 * patch defaults as fallback) into member.config for the keys their stage has
 * unlocked, then strip the stage-gated keys from family.config. Behaviour-
 * preserving for children at Economist — the only pre-W6 case in practice.
 * Idempotent: after the strip, the legacy-key check makes this a no-op.
 */
export async function migrateStageConfig(family, children, settledCounts) {
  const familyConfig = family?.config ?? {}
  if (!STAGE_GATED_KEYS.some(k => familyConfig[k] !== undefined)) return false

  const patchDefaults = Object.assign({}, ...Object.values(STAGE_PATCHES))
  for (const child of children) {
    const stage = deriveStage(settledCounts?.[child.id] ?? 0, familyConfig.stageOverride)
    const cfg   = child.config ?? {}
    const patch = {}
    for (const key of unlockedStageKeys(stage)) {
      if (cfg[key] === undefined) patch[key] = familyConfig[key] ?? patchDefaults[key]
    }
    if (Object.keys(patch).length) await updateMemberConfig(child.id, { ...cfg, ...patch })
  }

  const stripped = { ...familyConfig }
  for (const k of STAGE_GATED_KEYS) delete stripped[k]
  await updateFamilyConfig(family.id, stripped)
  return true
}

// ── Per-child economic config ─────────────────────────────────────────────────

export async function updateMemberConfig(memberId, config) {
  throwIfError(await supabase
    .from('members')
    .update({ config: config ?? null })
    .eq('id', memberId))
}

export async function setMemberVacation(memberId, vacation) {
  // vacation: { active: bool, paidLeave: bool, startDate: string } | null
  const member = await getMember(memberId)
  if (!member) return
  const newConfig = { ...(member.config ?? {}), vacation: vacation ?? null }
  await updateMemberConfig(memberId, newConfig)
}

// ── Credit Score ─────────────────────────────────────────────────────────────

export async function updateCreditScore(memberId, delta) {
  const member = await getMember(memberId)
  if (!member) return
  const current  = member.creditScore ?? 500
  const newScore = Math.min(850, Math.max(300, Math.round(current + delta)))
  throwIfError(await supabase
    .from('members')
    .update({ credit_score: newScore })
    .eq('id', memberId))
  return newScore
}

// ── Credit popup seen marker ──────────────────────────────────────────────────

export async function markCreditPopupSeen(memberId, periodEnd) {
  throwIfError(await supabase
    .from('members')
    .update({ last_credit_popup_period: periodEnd })
    .eq('id', memberId))
}

// ── Data Export / Import (Backup & Restore) ──────────────────────────────────

export async function exportAllData(familyId) {
  const [
    familyRes, membersRes, choresRes, choreLogsRes,
    transactionsRes, rewardsRes, payslipsRes,
    utilityChargesRes, rewardRequestsRes, memberRequestsRes,
  ] = await Promise.all([
    supabase.from('families').select('*').eq('id', familyId),
    supabase.from('members').select('*').eq('family_id', familyId),
    supabase.from('chores').select('*').eq('family_id', familyId),
    supabase.from('chore_logs').select('*').in(
      'member_id',
      (await supabase.from('members').select('id').eq('family_id', familyId)).data?.map(m => m.id) ?? []
    ),
    supabase.from('transactions').select('*').in(
      'member_id',
      (await supabase.from('members').select('id').eq('family_id', familyId)).data?.map(m => m.id) ?? []
    ),
    supabase.from('rewards').select('*').eq('family_id', familyId),
    supabase.from('payslips').select('*').in(
      'member_id',
      (await supabase.from('members').select('id').eq('family_id', familyId)).data?.map(m => m.id) ?? []
    ),
    supabase.from('utility_charges').select('*').in(
      'member_id',
      (await supabase.from('members').select('id').eq('family_id', familyId)).data?.map(m => m.id) ?? []
    ),
    supabase.from('reward_requests').select('*').in(
      'member_id',
      (await supabase.from('members').select('id').eq('family_id', familyId)).data?.map(m => m.id) ?? []
    ),
    supabase.from('member_requests').select('*').eq('family_id', familyId),
  ])

  return {
    exportedAt: new Date().toISOString(),
    version: 4,
    families:       (familyRes.data ?? []).map(mapFamily),
    members:        (membersRes.data ?? []).map(mapMember),
    chores:         (choresRes.data ?? []).map(mapChore),
    choreLogs:      (choreLogsRes.data ?? []).map(mapChoreLog),
    transactions:   (transactionsRes.data ?? []).map(mapTransaction),
    rewards:        (rewardsRes.data ?? []).map(mapReward),
    payslips:       (payslipsRes.data ?? []).map(mapPayslip),
    utilityCharges: (utilityChargesRes.data ?? []).map(mapUtilityCharge),
    rewardRequests: (rewardRequestsRes.data ?? []).map(mapRewardRequest),
    memberRequests: (memberRequestsRes.data ?? []).map(mapMemberRequest),
  }
}

export async function importAllData(data) {
  // Clear all data for this family first
  const memberIds = (data.members ?? []).map(m => m.id)
  const familyId  = data.families?.[0]?.id

  if (!familyId) throw new Error('No family in backup')

  // Delete in reverse-dependency order
  if (memberIds.length) {
    await Promise.all([
      supabase.from('chore_logs').delete().in('member_id', memberIds),
      supabase.from('transactions').delete().in('member_id', memberIds),
      supabase.from('payslips').delete().in('member_id', memberIds),
      supabase.from('utility_charges').delete().in('member_id', memberIds),
      supabase.from('reward_requests').delete().in('member_id', memberIds),
      supabase.from('member_requests').delete().eq('family_id', familyId),
      // alerts are device-era ephemera (never in backups) — clear stale rows
      supabase.from('alerts').delete().eq('family_id', familyId),
    ])
  }
  await supabase.from('chores').delete().eq('family_id', familyId)
  await supabase.from('rewards').delete().eq('family_id', familyId)
  await supabase.from('members').delete().eq('family_id', familyId)
  await supabase.from('families').delete().eq('id', familyId)

  // Re-insert families
  for (const fam of data.families ?? []) {
    throwIfError(await supabase.from('families').insert({
      id:               fam.id,
      name:             fam.name,
      config:           fam.config,
      tax_fund_balance: fam.taxFundBalance ?? 0,
      tax_fund_history: fam.taxFundHistory ?? [],
    }))
  }

  // Re-insert members
  for (const m of data.members ?? []) {
    throwIfError(await supabase.from('members').insert({
      id:           m.id,
      family_id:    m.familyId,
      name:         m.name,
      avatar:       m.avatar,
      role:         m.role,
      pin:     m.pin,
      base_salary:  m.baseSalary,
      accounts:     m.accounts,
      config:       m.config ?? null,
      credit_score: m.creditScore ?? 500,
      last_credit_popup_period: m.lastCreditPopupPeriod ?? null,
    }))
  }

  // Re-insert chores
  for (const c of data.chores ?? []) {
    throwIfError(await supabase.from('chores').insert({
      id:            c.id,
      family_id:     c.familyId,
      title:         c.title,
      type:          c.type,
      recurrence:    c.recurrence,
      days_per_week: c.daysPerWeek ?? null,
      value:         c.value ?? 0,
      assigned_to:   c.assignedTo ?? [],
      is_active:     c.isActive ?? true,
    }))
  }

  // Re-insert rewards
  for (const r of data.rewards ?? []) {
    throwIfError(await supabase.from('rewards').insert({
      id:        r.id,
      family_id: r.familyId,
      title:     r.title,
      category:  r.category,
      // exports are mapped rows (cost → price); r.cost only in pre-v4 backups
      cost:      r.price ?? r.cost ?? 0,
      is_active: r.isActive ?? true,
      emoji:     r.emoji ?? null,
    }))
  }

  // Bulk insert remaining tables
  // payslips.created_at is timestamptz; chore/reward timestamps are bigint (ms numbers)
  const msToISO = (v) => v ? (typeof v === 'number' ? new Date(v).toISOString() : v) : null

  if ((data.choreLogs ?? []).length) {
    throwIfError(await supabase.from('chore_logs').insert(
      data.choreLogs.map(l => ({
        id: l.id, chore_id: l.choreId, member_id: l.memberId,
        date: l.date, status: l.status,
        completed_at: l.completedAt ?? null,
        approved_at:  l.approvedAt  ?? null,
      }))
    ))
  }
  if ((data.transactions ?? []).length) {
    throwIfError(await supabase.from('transactions').insert(
      data.transactions.map(t => ({
        id: t.id, member_id: t.memberId, type: t.type,
        amount: t.amount, description: t.description,
        date: t.date, related_id: t.relatedId ?? null,
      }))
    ))
  }
  if ((data.payslips ?? []).length) {
    throwIfError(await supabase.from('payslips').insert(
      data.payslips.map(p => ({
        id: p.id, member_id: p.memberId,
        period_start: p.periodStart, period_end: p.periodEnd,
        earnings: p.earnings, deductions: p.deductions,
        gross: p.gross, net: p.net, allocations: p.allocations,
        total_deductions: p.totalDeductions,
        interest_earned: p.interestEarned,
        loan_outstanding_after: p.loanOutstandingAfter,
        balances_after: p.balancesAfter,
        credit_score: p.creditScore,
        created_at: msToISO(p.createdAt),
        status: p.status ?? 'settled',
        bonus_potential: p.bonusPotential ?? 0,
        pending_transactions: p.pendingTransactions ?? [],
        credit_delta: p.creditDelta ?? 0,
        stage: p.stage ?? null,
      }))
    ))
  }
  if ((data.utilityCharges ?? []).length) {
    throwIfError(await supabase.from('utility_charges').insert(
      data.utilityCharges.map(u => ({
        id: u.id, member_id: u.memberId,
        date: u.date, reason: u.reason, amount: u.amount,
      }))
    ))
  }
  if ((data.rewardRequests ?? []).length) {
    throwIfError(await supabase.from('reward_requests').insert(
      data.rewardRequests.map(r => ({
        id: r.id, member_id: r.memberId, reward_id: r.rewardId,
        reward_title: r.rewardTitle, amount: r.amount, status: r.status,
        requested_at: r.requestedAt ?? null, resolved_at: r.resolvedAt ?? null,
      }))
    ))
  }
  if ((data.memberRequests ?? []).length) {
    throwIfError(await supabase.from('member_requests').insert(
      data.memberRequests.map(r => ({
        id: r.id, family_id: r.familyId, member_id: r.memberId,
        type: r.type, status: r.status, amount: r.amount,
        description: r.description, metadata: r.metadata ?? null,
        requested_at: r.requestedAt ?? null, resolved_at: r.resolvedAt ?? null,
      }))
    ))
  }
}

// ── Tax Fund goal voting ──────────────────────────────────────────────────────

export async function getTaxTransactions(memberId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId)
    .eq('type', 'tax')
    .order('date', { ascending: true })
  throwIfError({ error })
  return (data ?? []).map(mapTransaction)
}

export async function addTaxGoalVote(memberId, familyId, description, amount) {
  // Cancel any existing pending vote from this member first
  await supabase
    .from('member_requests')
    .update({ status: 'cancelled', resolved_at: Date.now() })
    .eq('member_id', memberId)
    .eq('type', 'tax_goal_vote')
    .eq('status', 'pending')

  throwIfError(await supabase.from('member_requests').insert({
    id:           crypto.randomUUID(),
    family_id:    familyId,
    member_id:    memberId,
    type:         'tax_goal_vote',
    status:       'pending',
    amount,
    description,
    metadata:     null,
    requested_at: Date.now(),
  }))
}

export async function getPendingTaxGoalVotes(familyId) {
  const { data, error } = await supabase
    .from('member_requests')
    .select('*')
    .eq('family_id', familyId)
    .eq('type', 'tax_goal_vote')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
  throwIfError({ error })
  return (data ?? []).map(mapMemberRequest)
}

export async function cancelMyTaxGoalVote(memberId) {
  throwIfError(await supabase
    .from('member_requests')
    .update({ status: 'cancelled', resolved_at: Date.now() })
    .eq('member_id', memberId)
    .eq('type', 'tax_goal_vote')
    .eq('status', 'pending'))
}

export async function approveTaxGoalVote(requestId, familyId, description, amount, currentConfig) {
  // Set goal on family config
  await updateFamilyConfig(familyId, {
    ...currentConfig,
    taxFundGoal:      amount,
    taxFundGoalLabel: description,
  })
  // Approve this vote, cancel all others from this family
  await supabase
    .from('member_requests')
    .update({ status: 'cancelled', resolved_at: Date.now() })
    .eq('family_id', familyId)
    .eq('type', 'tax_goal_vote')
    .eq('status', 'pending')
  throwIfError(await supabase
    .from('member_requests')
    .update({ status: 'approved', resolved_at: Date.now() })
    .eq('id', requestId))
}

// ── Device auth (invite codes + device claims) ────────────────────────────────

function getOrCreateDeviceId() {
  let id = localStorage.getItem('artha_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('artha_device_id', id)
  }
  return id
}

export { getOrCreateDeviceId }

/** Generate a 6-char alphanumeric invite code for a specific member (10-min TTL). */
export async function generateJoinCode(familyId, memberId) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  throwIfError(await supabase.from('join_codes').insert({
    code,
    family_id: familyId,
    member_id: memberId,
    expires_at: expiresAt,
    used_at: null,
  }))
  return { code, expiresAt }
}

/** Look up a device claim for this device. Returns null if unclaimed. */
export async function getDeviceClaim() {
  const deviceId = getOrCreateDeviceId()
  const { data, error } = await supabase
    .from('device_claims')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle()
  if (error) return null
  if (!data) return null
  return { deviceId, familyId: data.family_id, memberId: data.member_id }
}

/** Redeem an invite code — ties this device to the family + member. */
export async function claimDevice(code) {
  const deviceId = getOrCreateDeviceId()
  const now = new Date().toISOString()

  // Fetch code
  const { data: row, error } = await supabase
    .from('join_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()
  if (error || !row) throw new Error('Invalid code')
  if (row.used_at) throw new Error('Code already used')
  if (new Date(row.expires_at) < new Date()) throw new Error('Code expired')

  // Mark code used
  throwIfError(await supabase
    .from('join_codes')
    .update({ used_at: now })
    .eq('code', code.toUpperCase()))

  // Upsert device claim (allow re-claiming device)
  throwIfError(await supabase.from('device_claims').upsert({
    device_id: deviceId,
    family_id: row.family_id,
    member_id: row.member_id,
    claimed_at: now,
  }))

  setFamilyId(row.family_id)
  return { familyId: row.family_id, memberId: row.member_id }
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/** Returns true if any family row exists in Supabase (single-family phase check). */
export async function checkFamilyExists() {
  const { count } = await supabase
    .from('families')
    .select('id', { count: 'exact', head: true })
  return (count ?? 0) > 0
}

/**
 * Create a brand-new family with the first parent member.
 * Returns the new memberId so the device can be auto-claimed and auto-logged-in.
 */
export async function createFamily({ familyName, memberName, avatar, pinHash, config }) {
  const familyId = crypto.randomUUID()
  setFamilyId(familyId)

  // Family row
  throwIfError(await supabase.from('families').insert({
    id:               familyId,
    name:             familyName,
    config:           config ?? { ...DEFAULT_CONFIG },
    tax_fund_balance: 0,
    tax_fund_history: [],
  }))

  // First parent member
  const memberId = crypto.randomUUID()
  throwIfError(await supabase.from('members').insert({
    id:           memberId,
    family_id:    familyId,
    name:         memberName,
    role:         'parent',
    pin:          pinHash,
    avatar,
    base_salary:  0,
    accounts:     { spending: 0, savings: 0, philanthropy: 0, subGoals: [], loan: null },
    credit_score: 500,
  }))

  // Auto-claim this device as the founding parent device
  const deviceId = getOrCreateDeviceId()
  await supabase.from('device_claims').upsert({
    device_id:  deviceId,
    family_id:  familyId,
    member_id:  memberId,
    claimed_at: new Date().toISOString(),
  })

  return { memberId, deviceId, familyId }
}
