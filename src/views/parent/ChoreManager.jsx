import { useState, useCallback, useRef } from 'react'
import { Plus, X, Check, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { useFamily, useCurrency, usePeriod } from '../../context/FamilyContext'
import { addChore, updateChore, toggleChoreActive, updateMember } from '../../db/operations'
import { CHORE_RECURRENCE } from '../../utils/constants'
import { getFamilyId } from '../../utils/family'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Expected completions per week for a chore based on recurrence */
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

const WEEKS_PER_MONTH = 52 / 12 // ≈ 4.33

// ── Recurrence badge ──────────────────────────────────────────────────────────
function RecurrenceBadge({ recurrence, daysPerWeek }) {
  const labels = {
    daily: 'Daily', weekday: 'Wkday', weekend: 'Wkend',
    weekly: 'Weekly', custom: `${daysPerWeek}×/wk`, once: 'Once',
  }
  return (
    <span className="text-xs font-mono px-1.5 py-0.5 rounded"
      style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
      {labels[recurrence] ?? recurrence}
    </span>
  )
}

// ── Earnings summary card (with editable salary) ─────────────────────────────
function EarningsSummary({ child, mandatoryChores, allBonusChores, payPeriod, fmt, onSalaryChange }) {
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const inputRef = useRef(null)

  const activeMandatory     = mandatoryChores.filter(c => c.isActive)
  const totalWeeklyExpected = activeMandatory.reduce((s, c) => s + weeklyFreq(c), 0)

  const baseSalary    = child.baseSalary ?? 0

  const applicableBonuses    = allBonusChores.filter(c =>
    c.isActive && (c.assignedTo.length === 0 || c.assignedTo.includes(child.id))
  )
  const weeklyBonusPotential = applicableBonuses.reduce((s, c) => s + weeklyFreq(c) * c.value, 0)

  const startEdit = () => {
    setDraft(String(baseSalary))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 50)
  }

  const commitEdit = async () => {
    const val = Number(draft)
    if (!val || val <= 0 || val === baseSalary) { setEditing(false); return }
    setSaving(true)
    await updateMember(child.id, { baseSalary: val })
    await onSalaryChange()
    setSaving(false)
    setEditing(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  const periodLabel = payPeriod === 'monthly' ? 'mo' : 'wk'

  return (
    <div className="mx-4 mt-3 px-3 py-3 rounded-xl flex flex-col gap-2.5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

      {/* Salary header — tap to edit */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>BASE SALARY</p>
          {totalWeeklyExpected > 0 && (
            <p className="text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
              {totalWeeklyExpected} completions/wk
            </p>
          )}
        </div>
        {!editing && (
          <button onClick={startEdit}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono transition-all"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Pencil size={10} /> Edit
          </button>
        )}
      </div>

      {/* Inline salary editor */}
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="number" min={1} value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--accent-blue)', color: 'var(--text-primary)' }}
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>/{periodLabel}</span>
          <button onClick={commitEdit} disabled={saving}
            className="px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}>
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)}
            className="px-2 py-2 rounded-lg"
            style={{ color: 'var(--text-muted)', background: 'var(--bg-raised)' }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
          <p style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-dim)' }}>
            {payPeriod === 'monthly' ? 'PER MONTH' : 'PER WEEK'}
          </p>
          <p className="text-base font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>
            {fmt(baseSalary)}
          </p>
        </div>
      )}

      {weeklyBonusPotential > 0 && !editing && (
        <div className="flex items-center justify-between"
          style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            + Max bonus/wk ({applicableBonuses.length} bonus chore{applicableBonuses.length !== 1 ? 's' : ''})
          </span>
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--warning)' }}>
            {fmt(weeklyBonusPotential)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Bonus summary (All tab) ───────────────────────────────────────────────────
function BonusSummary({ bonusChores, children, fmt }) {
  const activeBonus = bonusChores.filter(c => c.isActive)
  if (activeBonus.length === 0) return null

  return (
    <div className="mx-4 mb-3 px-3 py-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-mono mb-2" style={{ color: 'var(--text-muted)' }}>
        BONUS POTENTIAL (if all claimed weekly)
      </p>
      <div className="flex flex-col gap-1.5">
        {children.map(child => {
          const applicable = activeBonus.filter(c =>
            c.assignedTo.length === 0 || c.assignedTo.includes(child.id)
          )
          const weeklyMax = applicable.reduce((s, c) => s + weeklyFreq(c) * c.value, 0)
          if (weeklyMax === 0) return null
          return (
            <div key={child.id} className="flex items-center justify-between">
              <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                {child.avatar} {child.name}
              </span>
              <span className="text-xs font-mono font-semibold" style={{ color: 'var(--warning)' }}>
                {fmt(weeklyMax)}/wk · {fmt(Math.round(weeklyMax * WEEKS_PER_MONTH))}/mo
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chore form (slide-up sheet) ───────────────────────────────────────────────
function ChoreForm({ type, initial, defaultAssigned, childMembers, onSave, onClose }) {
  const fmt = useCurrency()
  const { payPeriod } = usePeriod()
  const isEdit = !!initial

  const [title,       setTitle]       = useState(initial?.title       ?? '')
  const [recurrence,  setRecurrence]  = useState(initial?.recurrence  ?? 'daily')
  const [value,       setValue]       = useState(initial?.value        ?? 0)
  const [daysPerWeek, setDaysPerWeek] = useState(initial?.daysPerWeek ?? 3)
  const [assignedTo,  setAssignedTo]  = useState(initial?.assignedTo  ?? defaultAssigned ?? [])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  // Salary drafts: { [childId]: stringValue }
  const [salaryDrafts, setSalaryDrafts] = useState(() =>
    Object.fromEntries(childMembers.map(c => [c.id, String(c.baseSalary ?? 0)]))
  )

  const toggleAssign = (id) => {
    setAssignedTo(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    if (type === 'mandatory' && assignedTo.length === 0) {
      setError('Assign to at least one child'); return
    }
    // Validate salaries for assigned children
    if (type === 'mandatory') {
      for (const id of assignedTo) {
        const v = Number(salaryDrafts[id])
        if (!v || v <= 0) { setError('Enter a valid salary for each assigned child'); return }
      }
    }
    setSaving(true)
    const choreData = {
      familyId: getFamilyId(),
      title: title.trim(),
      type,
      value: type === 'bonus' ? Number(value) : 0,
      recurrence,
      daysPerWeek: recurrence === 'custom' ? Number(daysPerWeek) : null,
      assignedTo,
      isActive: initial?.isActive ?? true,
    }
    try {
      isEdit ? await updateChore(initial.id, choreData) : await addChore(choreData)
      // Save salary changes for assigned children
      if (type === 'mandatory') {
        await Promise.all(assignedTo.map(id => {
          const child = childMembers.find(c => c.id === id)
          const newSalary = Number(salaryDrafts[id])
          if (child && newSalary !== child.baseSalary) {
            return updateMember(id, { baseSalary: newSalary })
          }
        }))
      }
      onSave()
    } catch {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  const assignedChildren = childMembers.filter(c => assignedTo.includes(c.id))
  const periodLabel = payPeriod === 'monthly' ? 'month' : 'week'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit' : 'Add'} {type === 'mandatory' ? 'Mandatory' : 'Bonus'} Chore
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TITLE</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Make own bed"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Recurrence */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>RECURRENCE</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CHORE_RECURRENCE).map(([key, label]) => (
                <button key={key} onClick={() => setRecurrence(key)}
                  className="py-2 rounded-lg text-xs font-mono transition-all"
                  style={{
                    background: recurrence === key ? 'var(--accent-blue)' : 'var(--bg-raised)',
                    border: `1px solid ${recurrence === key ? 'var(--accent-blue)' : 'var(--border)'}`,
                    color: recurrence === key ? '#fff' : 'var(--text-muted)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Days per week (custom only) */}
          {recurrence === 'custom' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TIMES PER WEEK</label>
              <input type="number" min={1} max={7} value={daysPerWeek}
                onChange={e => setDaysPerWeek(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          )}

          {/* Value (bonus only) */}
          {type === 'bonus' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>BONUS VALUE</label>
              <input type="number" min={1} value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              {value > 0 && (
                <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                  {fmt(Number(value))} credited instantly on parent approval
                </p>
              )}
            </div>
          )}

          {/* Salary fields (mandatory only, per assigned child) */}
          {type === 'mandatory' && assignedChildren.length > 0 && (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                BASE SALARY (per {periodLabel})
              </label>
              {assignedChildren.map(child => (
                <div key={child.id} className="flex items-center gap-3">
                  <span className="text-xl shrink-0">{child.avatar}</span>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{child.name}</span>
                    <input
                      type="number" min={1}
                      value={salaryDrafts[child.id] ?? ''}
                      onChange={e => setSalaryDrafts(prev => ({ ...prev, [child.id]: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                Payout = salary × chore completion %. Changes apply from next payslip.
              </p>
            </div>
          )}

          {/* Assign to */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {type === 'mandatory' ? 'ASSIGN TO (required)' : 'RESTRICT TO (empty = all children)'}
            </label>
            <div className="flex gap-2 flex-wrap">
              {childMembers.map(child => {
                const selected = assignedTo.includes(child.id)
                return (
                  <button key={child.id} onClick={() => toggleAssign(child.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
                    style={{
                      background: selected ? 'var(--accent-blue)' : 'var(--bg-raised)',
                      border: `1px solid ${selected ? 'var(--accent-blue)' : 'var(--border)'}`,
                      color: selected ? '#fff' : 'var(--text-muted)',
                    }}>
                    <span>{child.avatar}</span>
                    <span>{child.name}</span>
                    {selected && <Check size={12} />}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: saving ? 'var(--border)' : 'var(--accent-blue)',
              color: saving ? 'var(--text-muted)' : '#fff',
            }}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Chore'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Chore row ─────────────────────────────────────────────────────────────────
function ChoreRow({ chore, weeklyValue, assignedChildren, onEdit, onToggle }) {
  const fmt = useCurrency()
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        opacity: chore.isActive ? 1 : 0.45,
      }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>
          {chore.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <RecurrenceBadge recurrence={chore.recurrence} daysPerWeek={chore.daysPerWeek} />
          {chore.type === 'bonus' && chore.value > 0 && (
            <span className="text-xs font-mono font-semibold" style={{ color: 'var(--positive)' }}>
              {fmt(chore.value)}
            </span>
          )}
          {chore.type === 'mandatory' && weeklyValue != null && weeklyValue > 0 && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              ≈ {fmt(weeklyValue)}/wk
            </span>
          )}
          {/* Show assigned avatars in All view */}
          {assignedChildren && assignedChildren.length > 0 && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
              {assignedChildren.map(c => c.avatar).join(' ')}
            </span>
          )}
        </div>
      </div>
      <button onClick={onEdit} className="p-1.5 rounded-lg"
        style={{ color: 'var(--text-muted)', background: 'var(--bg-raised)' }}>
        <Pencil size={14} />
      </button>
      <button onClick={onToggle} className="p-1.5 rounded-lg"
        style={{ color: chore.isActive ? 'var(--positive)' : 'var(--text-dim)' }}>
        {chore.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
      </button>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ label }) {
  return (
    <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ChoreManager() {
  const { chores: allChores, children, reload } = useFamily()
  const fmt = useCurrency()
  const { payPeriod } = usePeriod()

  const [selectedChild, setSelectedChild] = useState(null) // null = All
  const [form, setForm] = useState(null) // null | { type, initial?, defaultAssigned? }

  const handleSave = useCallback(async () => {
    await reload()
    setForm(null)
  }, [reload])

  const handleToggle = useCallback(async (chore) => {
    await toggleChoreActive(chore.id, chore.isActive)
    await reload()
  }, [reload])

  const mandatoryChores = allChores.filter(c => c.type === 'mandatory')
  const bonusChores     = allChores.filter(c => c.type === 'bonus')

  const child = children.find(c => c.id === selectedChild) ?? null

  const filteredMandatory = selectedChild
    ? mandatoryChores.filter(c => c.assignedTo.includes(selectedChild))
    : mandatoryChores

  const filteredBonus = selectedChild
    ? bonusChores.filter(c => c.assignedTo.length === 0 || c.assignedTo.includes(selectedChild))
    : bonusChores

  // Per-completion value for the selected child
  const activeMandatory     = filteredMandatory.filter(c => c.isActive)
  const totalWeeklyExpected = activeMandatory.reduce((s, c) => s + weeklyFreq(c), 0)
  const perCompletion       = child && totalWeeklyExpected > 0
    ? child.baseSalary / totalWeeklyExpected
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          Chore Manager
        </h2>
      </div>

      {/* Child tabs */}
      <div className="flex shrink-0 px-4 pt-3 gap-2 overflow-x-auto">
        <button
          onClick={() => setSelectedChild(null)}
          className="px-4 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap"
          style={{
            background: selectedChild === null ? 'var(--accent-blue)' : 'var(--bg-raised)',
            border: `1px solid ${selectedChild === null ? 'var(--accent-blue)' : 'var(--border)'}`,
            color: selectedChild === null ? '#fff' : 'var(--text-muted)',
          }}>
          All
        </button>
        {children.map(c => (
          <button key={c.id}
            onClick={() => setSelectedChild(c.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap"
            style={{
              background: selectedChild === c.id ? 'var(--accent-blue)' : 'var(--bg-raised)',
              border: `1px solid ${selectedChild === c.id ? 'var(--accent-blue)' : 'var(--border)'}`,
              color: selectedChild === c.id ? '#fff' : 'var(--text-muted)',
            }}>
            <span>{c.avatar}</span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

        {/* Earnings summary — only when a child is selected */}
        {child && (
          <EarningsSummary
            child={child}
            mandatoryChores={filteredMandatory}
            allBonusChores={bonusChores}
            payPeriod={payPeriod}
            fmt={fmt}
            onSalaryChange={reload}
          />
        )}

        {/* MANDATORY section */}
        <div className="flex flex-col gap-2">
          <SectionHeader label="MANDATORY" />
          {filteredMandatory.length === 0 ? (
            <p className="text-xs font-mono text-center py-4" style={{ color: 'var(--text-dim)' }}>
              No mandatory chores{child ? ` for ${child.name}` : ''} — tap + to add
            </p>
          ) : (
            filteredMandatory.map(chore => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                weeklyValue={perCompletion != null ? Math.round(weeklyFreq(chore) * perCompletion) : null}
                assignedChildren={selectedChild ? null : children.filter(c => chore.assignedTo.includes(c.id))}
                onEdit={() => setForm({ type: 'mandatory', initial: chore })}
                onToggle={() => handleToggle(chore)}
              />
            ))
          )}
        </div>

        {/* BONUS section */}
        <div className="flex flex-col gap-2">
          <SectionHeader label="BONUS ⚡" />
          {/* Bonus potential summary in All view */}
          {!child && <BonusSummary bonusChores={bonusChores} children={children} fmt={fmt} />}
          {filteredBonus.length === 0 ? (
            <p className="text-xs font-mono text-center py-4" style={{ color: 'var(--text-dim)' }}>
              No bonus chores{child ? ` for ${child.name}` : ''} — tap + to add
            </p>
          ) : (
            filteredBonus.map(chore => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                weeklyValue={null}
                assignedChildren={selectedChild ? null : children.filter(c => chore.assignedTo.includes(c.id))}
                onEdit={() => setForm({ type: 'bonus', initial: chore })}
                onToggle={() => handleToggle(chore)}
              />
            ))
          )}
        </div>
      </div>

      {/* Add buttons */}
      <div className="px-4 py-3 shrink-0 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => setForm({
            type: 'mandatory',
            defaultAssigned: child ? [child.id] : [],
          })}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <Plus size={16} />
          Mandatory
        </button>
        <button
          onClick={() => setForm({ type: 'bonus', defaultAssigned: [] })}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--warning)' }}>
          <Plus size={16} />
          Bonus ⚡
        </button>
      </div>

      {/* Form modal */}
      {form && (
        <ChoreForm
          type={form.type}
          initial={form.initial}
          defaultAssigned={form.defaultAssigned}
          childMembers={children}
          onSave={handleSave}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
