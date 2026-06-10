import { useState, useRef } from 'react'
import { Download, Upload, AlertTriangle, CheckCircle, Cloud, FlaskConical, Trash2 } from 'lucide-react'
import { addDays, subDays, parseISO, format, getDay } from 'date-fns'
import { exportAllData, importAllData, getFamily, getMembers, getChores, getPayslipForPeriod, getMember, giveLoan, giveBonus, getRewards, transferSavingsToWallet, addTransaction, updateMemberAccounts, parentDonate, parentDepositToSubGoal } from '../../db/operations'
import { migrateToSupabase } from '../../db/migrate'
import { runPayslip, settlePayslip } from '../../engine/payslip'
import { supabase } from '../../db/supabase'
import { useFamily } from '../../context/FamilyContext'
import { getFamilyId } from '../../utils/family'
import { currentPeriodStart } from '../../utils/dates'

export default function Backup() {
  const { reload } = useFamily()
  const fileRef = useRef(null)

  const [exporting,  setExporting]  = useState(false)
  const [importing,  setImporting]  = useState(false)
  const [migrating,  setMigrating]  = useState(false)
  const [pendingData, setPendingData] = useState(null) // parsed import payload
  const [status, setStatus]     = useState(null)       // { type: 'ok'|'error', msg }
  const [generating, setGenerating] = useState(false)
  const [genPeriods, setGenPeriods] = useState(4)
  const [genProgress, setGenProgress] = useState('')
  const [resetting,  setResetting]  = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  // ── Reset all history ────────────────────────────────────────────────────────
  const handleReset = async () => {
    setResetting(true)
    setStatus(null)
    try {
      const members = await getMembers(getFamilyId())
      const memberIds = members.map(m => m.id)

      // Delete all transactional data in parallel
      await Promise.all([
        supabase.from('chore_logs').delete().in('member_id', memberIds),
        supabase.from('transactions').delete().in('member_id', memberIds),
        supabase.from('payslips').delete().in('member_id', memberIds),
        supabase.from('utility_charges').delete().in('member_id', memberIds),
        supabase.from('reward_requests').delete().in('member_id', memberIds),
        supabase.from('member_requests').delete().in('member_id', memberIds),
        // Zero tax fund on the family row
        supabase.from('families').update({ tax_fund_balance: 0, tax_fund_history: [] }).eq('id', getFamilyId()),
      ])

      // Zero out all wallet balances for child members
      const children = members.filter(m => m.role === 'child')
      await Promise.all(children.map(m =>
        updateMemberAccounts(m.id, {
          ...m.accounts,
          spending:     0,
          savings:      0,
          philanthropy: 0,
          subGoals:     (m.accounts?.subGoals ?? []).map(sg => ({ ...sg, balance: 0 })),
        })
      ))

      await reload()
      setConfirmReset(false)
      setStatus({ type: 'ok', msg: 'History cleared. All wallets zeroed. Ready to regenerate.' })
    } catch (e) {
      setStatus({ type: 'error', msg: `Reset failed: ${e.message}` })
    }
    setResetting(false)
  }

  // ── Migrate from local device → Supabase ────────────────────────────────────
  const handleMigrate = async () => {
    setMigrating(true)
    setStatus(null)
    try {
      const counts = await migrateToSupabase()
      await reload()
      setStatus({ type: 'ok', msg: `Migration complete! ${counts.members} members, ${counts.chores} chores, ${counts.transactions} transactions moved to cloud.` })
    } catch (e) {
      setStatus({ type: 'error', msg: `Migration failed: ${e.message}` })
    }
    setMigrating(false)
  }

  // ── Generate test history ────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true)
    setStatus(null)
    setGenProgress('Loading family data...')
    try {
      const [family, allMembers, allChores] = await Promise.all([
        getFamily(getFamilyId()),
        getMembers(getFamilyId()),
        getChores(getFamilyId()),
      ])
      const childMembers = allMembers.filter(m => m.role === 'child')
      if (!childMembers.length) throw new Error('No children found.')

      const mandatoryChores = allChores.filter(c => c.isActive && c.type === 'mandatory')
      const bonusChores     = allChores.filter(c => c.isActive && c.type === 'bonus')

      // Derive payday DOW from family config (default Saturday=6)
      const paydayDow = family.config?.paydayDow ?? 6

      // Current period start as ISO date
      const cpStart = currentPeriodStart(family.config)

      // isDueOnDay: returns true if chore is due on given Date object
      function isDueOnDay(chore, date) {
        const dow = getDay(date)
        switch (chore.recurrence) {
          case 'daily':   return true
          case 'weekday': return dow >= 1 && dow <= 5
          case 'weekend': return dow === 0 || dow === 6
          case 'weekly':  return dow === 1
          case 'custom':  return true
          default:        return false
        }
      }

      let totalPayslips = 0
      const rewards = await getRewards(getFamilyId())

      for (let n = 1; n <= genPeriods; n++) {
        const periodStart = format(subDays(parseISO(cpStart), n * 7), 'yyyy-MM-dd')
        const periodEnd   = format(addDays(parseISO(periodStart), 6), 'yyyy-MM-dd')
        const isOldest    = n === genPeriods

        setGenProgress(`Period ${n}/${genPeriods}: ${periodStart} → ${periodEnd}`)

        for (const member of childMembers) {
          // Random completion rate 70–100%
          const completionRate = 0.70 + Math.random() * 0.30

          // Build approved chore_log rows for mandatory chores
          const logs = []
          let day = parseISO(periodStart)
          for (let d = 0; d < 7; d++) {
            const dateStr = format(day, 'yyyy-MM-dd')
            const memberMandatory = mandatoryChores.filter(c =>
              c.assignedTo.includes(member.id) && isDueOnDay(c, day)
            )
            for (const chore of memberMandatory) {
              if (Math.random() < completionRate) {
                logs.push({
                  id:           crypto.randomUUID(),
                  chore_id:     chore.id,
                  member_id:    member.id,
                  date:         dateStr,
                  status:       'approved',
                  completed_at: new Date(dateStr).getTime(),
                  approved_at:  new Date(dateStr).getTime() + 3600000,
                })
              }
            }
            day = addDays(day, 1)
          }

          // Randomly add some bonus chores (0–all of them, on random days)
          const memberBonus = bonusChores.filter(c =>
            c.assignedTo.length === 0 || c.assignedTo.includes(member.id)
          )
          for (const chore of memberBonus) {
            if (Math.random() < 0.5) { // 50% chance each bonus chore gets done
              const randomDayOffset = Math.floor(Math.random() * 7)
              const bonusDay = format(addDays(parseISO(periodStart), randomDayOffset), 'yyyy-MM-dd')
              logs.push({
                id:           crypto.randomUUID(),
                chore_id:     chore.id,
                member_id:    member.id,
                date:         bonusDay,
                status:       'approved',
                completed_at: new Date(bonusDay).getTime(),
                approved_at:  new Date(bonusDay).getTime() + 3600000,
              })
            }
          }

          // Skip if payslip already exists for this period
          const existing = await getPayslipForPeriod(member.id, periodEnd)
          if (existing) {
            setGenProgress(`Period ${n}/${genPeriods}: skipping ${member.name} (payslip exists)`)
            continue
          }

          // Delete any existing chore_logs for this period (from a partial previous run)
          await supabase.from('chore_logs')
            .delete()
            .eq('member_id', member.id)
            .gte('date', periodStart)
            .lte('date', periodEnd)

          // Insert all logs
          if (logs.length > 0) {
            const { error: logErr } = await supabase.from('chore_logs').insert(logs)
            if (logErr) throw new Error(`chore_logs insert: ${logErr.message}`)
          }

          // Give a loan in the oldest period so repayments show in subsequent payslips
          if (isOldest) {
            const fresh = await getMember(member.id)
            if (!fresh.accounts?.loan?.outstanding) {
              await giveLoan(member.id, 300, 50, false)
            }
          }

          // Utility charge: random amount 10–60, ~60% of periods
          if (Math.random() < 0.6) {
            const utilAmt  = Math.round((10 + Math.random() * 50) / 5) * 5
            const midDay   = format(addDays(parseISO(periodStart), 3), 'yyyy-MM-dd')
            await supabase.from('utility_charges').insert({
              id:          crypto.randomUUID(),
              family_id:   getFamilyId(),
              member_id:   member.id,
              label:       ['WiFi', 'Electricity', 'Water', 'Netflix share'][Math.floor(Math.random() * 4)],
              amount:      utilAmt,
              date:        midDay,
              charged_at:  new Date(midDay).getTime(),
            })
          }

          // Run & settle payslip (utility charges above will be deducted)
          const ps = await runPayslip(member.id, { start: periodStart, end: periodEnd })
          await settlePayslip(ps.id)
          totalPayslips++

          // After settlement, reload member to get updated balances
          const settled = await getMember(member.id)

          // Parent bonus: ~35% of periods
          if (Math.random() < 0.35) {
            const bonusAmt = [20, 30, 50, 75, 100][Math.floor(Math.random() * 5)]
            await giveBonus(member.id, bonusAmt, 'Well done this week!')
            // Backdate the transaction to mid-period
            await supabase.from('transactions')
              .update({ date: format(addDays(parseISO(periodStart), 4), 'yyyy-MM-dd') })
              .eq('member_id', member.id)
              .eq('type', 'parent_bonus')
              .order('created_at', { ascending: false })
              .limit(1)
          }

          // Reward purchases: 1–2 per period, ~65% chance each attempt
          // r.price is the mapped field (DB col is `cost`, mapped to `price`)
          for (let attempt = 0; attempt < 2; attempt++) {
            if (Math.random() > 0.65) break
            const freshR    = await getMember(member.id)
            const wallet    = freshR.accounts?.spending ?? 0
            const affordable = rewards.filter(r => r.price > 0 && r.price <= wallet)
            if (!affordable.length) break
            const reward  = affordable[Math.floor(Math.random() * affordable.length)]
            const buyDate = format(addDays(parseISO(periodStart), Math.floor(Math.random() * 6)), 'yyyy-MM-dd')
            await updateMemberAccounts(member.id, {
              ...freshR.accounts,
              spending: wallet - reward.price,
            })
            await addTransaction({
              id:          crypto.randomUUID(),
              memberId:    member.id,
              type:        'reward',
              amount:      -reward.price,
              description: `Reward: ${reward.title}`,
              date:        buyDate,
              relatedId:   reward.id,
            })
          }

          // Donation from philanthropy: ~30% of periods
          const freshD = await getMember(member.id)
          const philBal = freshD.accounts?.philanthropy ?? 0
          if (philBal >= 20 && Math.random() < 0.30) {
            const donateAmt   = Math.min(philBal, Math.round((10 + Math.random() * 30) / 5) * 5)
            const charities   = ['Local food bank', 'Animal shelter', 'Tree planting drive', 'School supplies fund']
            const charity     = charities[Math.floor(Math.random() * charities.length)]
            const donateDate  = format(addDays(parseISO(periodStart), Math.floor(Math.random() * 6)), 'yyyy-MM-dd')
            try {
              await parentDonate(member.id, donateAmt, charity)
              // Backdate the transaction
              await supabase.from('transactions')
                .update({ date: donateDate })
                .eq('member_id', member.id)
                .eq('type', 'donation')
                .order('created_at', { ascending: false })
                .limit(1)
            } catch { /* skip if balance changed */ }
          }

          // Sub-goal deposit: ~25% of periods if member has sub-goals
          const freshG = await getMember(member.id)
          const subGoals = freshG.accounts?.subGoals ?? []
          const incomplete = subGoals.filter(g => g.balance < g.target)
          if (incomplete.length > 0 && (freshG.accounts?.spending ?? 0) >= 20 && Math.random() < 0.25) {
            const sg       = incomplete[Math.floor(Math.random() * incomplete.length)]
            const maxDep   = Math.min(sg.target - sg.balance, freshG.accounts.spending, 100)
            const depAmt   = Math.round((Math.random() * maxDep + 10) / 5) * 5
            try { await parentDepositToSubGoal(member.id, sg.id, Math.min(depAmt, maxDep)) }
            catch { /* skip */ }
          }

          // Savings → wallet transfer: ~20% of periods if savings > 150
          const fresh3 = await getMember(member.id)
          if ((fresh3.accounts?.savings ?? 0) > 150 && Math.random() < 0.20) {
            const transferAmt = Math.round(Math.random() * 50 + 20)
            await transferSavingsToWallet(member.id, Math.min(transferAmt, fresh3.accounts.savings))
          }
        }
      }

      await reload()
      setGenProgress('')
      setStatus({ type: 'ok', msg: `Generated ${totalPayslips} payslips across ${genPeriods} past period(s).` })
    } catch (e) {
      setGenProgress('')
      setStatus({ type: 'error', msg: `Generation failed: ${e.message}` })
    }
    setGenerating(false)
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    setStatus(null)
    try {
      const data = await exportAllData(getFamilyId())
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href     = url
      a.download = `artha-backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      setStatus({ type: 'ok', msg: 'Backup downloaded successfully.' })
    } catch (e) {
      setStatus({ type: 'error', msg: `Export failed: ${e.message}` })
    }
    setExporting(false)
  }

  // ── Import — step 1: pick file ────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.version || !data.families || !data.members) {
        throw new Error('Not a valid Artha backup file.')
      }
      setPendingData(data)
    } catch (err) {
      setStatus({ type: 'error', msg: `Could not read file: ${err.message}` })
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  // ── Import — step 2: confirm ───────────────────────────────────────────────
  const handleConfirmImport = async () => {
    if (!pendingData) return
    setImporting(true)
    setStatus(null)
    try {
      await importAllData(pendingData)
      await reload()
      setStatus({ type: 'ok', msg: 'Restore complete! All data has been replaced.' })
    } catch (err) {
      setStatus({ type: 'error', msg: `Restore failed: ${err.message}` })
    }
    setPendingData(null)
    setImporting(false)
  }

  const familyCount  = pendingData?.families?.length  ?? 0
  const memberCount  = pendingData?.members?.length   ?? 0
  const payslipCount = pendingData?.payslips?.length  ?? 0
  const txCount      = pendingData?.transactions?.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          Backup & Restore
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">

        {/* Status banner */}
        {status && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{
              background: status.type === 'ok' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${status.type === 'ok' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
            }}>
            {status.type === 'ok'
              ? <CheckCircle size={16} style={{ color: 'var(--positive)', flexShrink: 0, marginTop: 1 }} />
              : <AlertTriangle size={16} style={{ color: 'var(--negative)', flexShrink: 0, marginTop: 1 }} />
            }
            <p className="text-xs font-mono" style={{ color: status.type === 'ok' ? 'var(--positive)' : 'var(--negative)' }}>
              {status.msg}
            </p>
          </div>
        )}

        {/* Migration card — move local IndexedDB data to Supabase */}
        <div className="flex flex-col gap-3 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-3">
            <Cloud size={18} style={{ color: 'var(--positive)', flexShrink: 0, marginTop: 2 }} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>Migrate to cloud</p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                First-time setup: copies all data from this device's local storage to Supabase so it syncs across devices. Run once.
              </p>
            </div>
          </div>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: migrating ? 'var(--bg-raised)' : 'rgba(74,222,128,0.15)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: 'var(--positive)',
            }}>
            <Cloud size={15} />
            {migrating ? 'Migrating...' : 'Migrate Local Data to Cloud'}
          </button>
        </div>

        {/* Export card */}
        <div className="flex flex-col gap-3 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-3">
            <Download size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: 2 }} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>Export backup</p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Downloads all family data as a JSON file — members, chores, payslips, transactions, rewards, everything.
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: exporting ? 'var(--bg-raised)' : 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
            }}>
            <Download size={15} />
            {exporting ? 'Exporting...' : 'Download Backup'}
          </button>
        </div>

        {/* Import card */}
        <div className="flex flex-col gap-3 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-3">
            <Upload size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>Restore from backup</p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Replaces ALL current data with a backup file. This cannot be undone — export a backup first.
              </p>
            </div>
          </div>

          {/* Warning notice */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <p className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
              All current data will be permanently overwritten.
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing || !!pendingData}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.3)',
              color: 'var(--warning)',
            }}>
            <Upload size={15} />
            Choose Backup File
          </button>
        </div>

        {/* Confirm import dialog */}
        {pendingData && (
          <div className="flex flex-col gap-4 p-4 rounded-xl"
            style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)' }}>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--negative)' }}>
              Confirm Restore
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Families',     val: familyCount },
                { label: 'Members',      val: memberCount },
                { label: 'Payslips',     val: payslipCount },
                { label: 'Transactions', val: txCount },
              ].map(({ label, val }) => (
                <div key={label} className="flex flex-col px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{label.toUpperCase()}</span>
                  <span className="text-base font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{val}</span>
                </div>
              ))}
            </div>

            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Exported: {new Date(pendingData.exportedAt).toLocaleString()}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setPendingData(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-mono transition-all active:scale-95"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="flex-1 py-2.5 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
                style={{ background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.4)', color: 'var(--negative)' }}>
                {importing ? 'Restoring...' : 'Restore Now'}
              </button>
            </div>
          </div>
        )}

        {/* Generate test history — dev tool */}
        <div className="flex flex-col gap-3 p-4 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid rgba(168,85,247,0.3)' }}>
          <div className="flex items-start gap-3">
            <FlaskConical size={18} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                Generate Test History
              </p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Backdates random chore completions + settled payslips for all children.
                70–100% completion rate, random bonus chores. Dev-only — remove before prod.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Periods:</p>
            {[1, 2, 4, 8].map(n => (
              <button
                key={n}
                onClick={() => setGenPeriods(n)}
                className="px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all"
                style={{
                  background: genPeriods === n ? 'rgba(168,85,247,0.2)' : 'var(--bg-raised)',
                  border: `1px solid ${genPeriods === n ? 'rgba(168,85,247,0.5)' : 'var(--border)'}`,
                  color: genPeriods === n ? '#a855f7' : 'var(--text-muted)',
                }}>
                {n}
              </button>
            ))}
          </div>

          {genProgress ? (
            <p className="text-xs font-mono" style={{ color: '#a855f7' }}>
              ⏳ {genProgress}
            </p>
          ) : null}

          <button
            onClick={handleGenerate}
            disabled={generating || resetting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: generating ? 'var(--bg-raised)' : 'rgba(168,85,247,0.15)',
              border: '1px solid rgba(168,85,247,0.35)',
              color: generating ? 'var(--text-dim)' : '#a855f7',
            }}>
            <FlaskConical size={15} />
            {generating ? 'Generating...' : `Generate ${genPeriods} Period${genPeriods > 1 ? 's' : ''}`}
          </button>

          {/* Reset history */}
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              disabled={generating || resetting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-mono transition-all active:scale-95"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--negative)',
              }}>
              <Trash2 size={14} />
              Reset All History &amp; Wallets
            </button>
          ) : (
            <div className="flex flex-col gap-2 p-3 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <p className="text-xs font-mono text-center" style={{ color: 'var(--negative)' }}>
                This wipes all transactions, payslips, chore logs and zeros every wallet. Cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmReset(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-mono"
                  style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Cancel
                </button>
                <button onClick={handleReset} disabled={resetting}
                  className="flex-1 py-2 rounded-xl text-xs font-mono font-semibold active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--negative)', border: '1px solid rgba(239,68,68,0.4)' }}>
                  {resetting ? 'Resetting...' : 'Yes, wipe it'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info footer */}
        <p className="text-xs font-mono text-center px-4" style={{ color: 'var(--text-dim)' }}>
          Data is synced to Supabase and accessible from any device.{'\n'}
          JSON backups are extra insurance against accidental data loss.
        </p>
      </div>
    </div>
  )
}
