import { useState, useEffect, useCallback } from 'react'
import { useFamily, useCurrency } from '../../context/FamilyContext'
import { getPayslips, updateFamilyConfig } from '../../db/operations'
import { getFamilyId } from '../../utils/family'
import { X, ChevronDown, ChevronUp } from 'lucide-react'

// ── Settle sheet ──────────────────────────────────────────────────────────────
function SettleSheet({ child, unsettled, onSettle, onClose, fmt }) {
  const total = unsettled.rent + unsettled.utilities + unsettled.tax

  const [rent,      setRent]      = useState(String(Math.round(unsettled.rent)))
  const [utilities, setUtilities] = useState(String(Math.round(unsettled.utilities)))
  const [tax,       setTax]       = useState(String(Math.round(unsettled.tax)))
  const [saving,    setSaving]    = useState(false)

  const parsed = {
    rent:      Math.min(Math.max(Number(rent)      || 0, 0), unsettled.rent),
    utilities: Math.min(Math.max(Number(utilities) || 0, 0), unsettled.utilities),
    tax:       Math.min(Math.max(Number(tax)       || 0, 0), unsettled.tax),
  }
  const settlingTotal = parsed.rent + parsed.utilities + parsed.tax

  const handleSettle = async () => {
    if (!settlingTotal) return
    setSaving(true)
    try { await onSettle(parsed) } finally { setSaving(false) }
  }

  const setAll = () => {
    setRent(String(Math.round(unsettled.rent)))
    setUtilities(String(Math.round(unsettled.utilities)))
    setTax(String(Math.round(unsettled.tax)))
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
          <div>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>MARK AS SETTLED</p>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {child.avatar} {child.name}
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Unsettled summary */}
          <div className="px-3 py-2.5 rounded-xl flex items-center justify-between"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Total unsettled</span>
            <span className="text-sm font-mono font-bold" style={{ color: 'var(--warning)' }}>{fmt(total)}</span>
          </div>

          {/* Per-category inputs */}
          <div className="flex flex-col gap-3">
            {[
              { key: 'rent',      label: 'Rent',       emoji: '🏠', val: rent,      set: setRent,      max: unsettled.rent },
              { key: 'utilities', label: 'Utilities',  emoji: '💡', val: utilities, set: setUtilities, max: unsettled.utilities },
              { key: 'tax',       label: 'Tax',        emoji: '🏛',  val: tax,       set: setTax,       max: unsettled.tax },
            ].map(({ key, label, emoji, val, set, max }) => (
              max > 0 && (
                <div key={key} className="flex items-center gap-3">
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{emoji}</span>
                  <div className="flex-1">
                    <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-muted)' }}>
                      {label} <span style={{ color: 'var(--text-dim)' }}>· max {fmt(max)}</span>
                    </p>
                    <input
                      type="number" min={0} max={max} value={val}
                      onChange={e => set(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Quick: settle all */}
          <button onClick={setAll}
            className="w-full py-2 rounded-lg text-xs font-mono transition-all active:scale-95"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Fill all (settle everything)
          </button>

          {settlingTotal > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Marking as settled</span>
              <span className="text-sm font-mono font-bold" style={{ color: 'var(--positive)' }}>{fmt(settlingTotal)}</span>
            </div>
          )}

          <button onClick={handleSettle} disabled={saving || !settlingTotal}
            className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: saving || !settlingTotal ? 'var(--border)' : 'rgba(74,222,128,0.15)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: saving || !settlingTotal ? 'var(--text-dim)' : 'var(--positive)',
            }}>
            {saving ? 'Saving...' : `Mark ${fmt(settlingTotal)} Settled ✓`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Child expense card ────────────────────────────────────────────────────────
function ChildExpenseCard({ child, collected, unsettled, history, onSettle, fmt }) {
  const [expanded, setExpanded] = useState(false)
  const unsettledTotal = unsettled.rent + unsettled.utilities + unsettled.tax
  const collectedTotal = collected.rent + collected.utilities + collected.tax

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {child.avatar} {child.name}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              {fmt(collectedTotal)} collected total
            </p>
          </div>
          {unsettledTotal > 0 ? (
            <button onClick={onSettle}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95"
              style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: 'var(--positive)' }}>
              Settle ✓
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-lg text-xs font-mono"
              style={{ background: 'var(--bg-raised)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
              All settled ✓
            </span>
          )}
        </div>

        {/* Collected totals */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'RENT',      emoji: '🏠', collected: collected.rent,      unsettled: unsettled.rent },
            { label: 'UTILITIES', emoji: '💡', collected: collected.utilities,  unsettled: unsettled.utilities },
            { label: 'TAX',       emoji: '🏛',  collected: collected.tax,        unsettled: unsettled.tax },
          ].map(({ label, emoji, collected: col, unsettled: uns }) => (
            <div key={label} className="p-2.5 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{emoji} {label}</p>
              <p className="text-sm font-mono font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {fmt(col)}
              </p>
            </div>
          ))}
        </div>

        {/* Unsettled callout */}
        {unsettledTotal > 0 && (
          <div className="px-3 py-2 rounded-lg flex items-center justify-between"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>⏳ Not yet set aside</span>
            <span className="text-xs font-mono font-bold" style={{ color: 'var(--warning)' }}>{fmt(unsettledTotal)}</span>
          </div>
        )}
      </div>

      {/* Settlement history toggle */}
      {history.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              {history.length} settlement{history.length !== 1 ? 's' : ''} recorded
            </span>
            {expanded ? <ChevronUp size={13} style={{ color: 'var(--text-dim)' }} />
                       : <ChevronDown size={13} style={{ color: 'var(--text-dim)' }} />}
          </button>
          {expanded && (
            <div className="px-4 py-3 flex flex-col gap-2"
              style={{ borderTop: '1px solid var(--border)' }}>
              {history.map(s => (
                <div key={s.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {new Date(s.settledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                      🏠 {fmt(s.amounts.rent)} · 💡 {fmt(s.amounts.utilities)} · 🏛 {fmt(s.amounts.tax)}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--positive)' }}>
                    {fmt(s.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const { family, children, reload } = useFamily()
  const fmt = useCurrency()

  const [rows,        setRows]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [settlingFor, setSettlingFor] = useState(null) // { child, unsettled }

  const load = useCallback(async () => {
    if (!children.length) { setLoading(false); return }

    const settlements = family?.config?.expenseSettlements ?? []

    const results = await Promise.all(children.map(async child => {
      const payslips = await getPayslips(child.id)
      const settled  = payslips.filter(p => p.status === 'settled')

      const collected = settled.reduce((acc, p) => {
        acc.rent      += p.deductions?.rent ?? 0
        acc.utilities += (p.deductions?.recurringUtilities ?? 0)
                       + (p.deductions?.utilities ?? []).reduce((s, u) => s + u.amount, 0)
        acc.tax       += p.deductions?.tax ?? 0
        return acc
      }, { rent: 0, utilities: 0, tax: 0 })

      const childSettled = settlements
        .filter(s => s.memberId === child.id)
        .reduce((acc, s) => {
          acc.rent      += s.amounts?.rent      ?? 0
          acc.utilities += s.amounts?.utilities ?? 0
          acc.tax       += s.amounts?.tax       ?? 0
          return acc
        }, { rent: 0, utilities: 0, tax: 0 })

      const unsettled = {
        rent:      Math.max(0, collected.rent      - childSettled.rent),
        utilities: Math.max(0, collected.utilities - childSettled.utilities),
        tax:       Math.max(0, collected.tax       - childSettled.tax),
      }

      const history = settlements
        .filter(s => s.memberId === child.id)
        .sort((a, b) => b.settledAt.localeCompare(a.settledAt))

      return { child, collected, unsettled, history }
    }))

    setRows(results)
    setLoading(false)
  }, [children, family])

  useEffect(() => { load() }, [load])

  const handleSettle = async (amounts) => {
    const { child } = settlingFor
    const existing  = family?.config?.expenseSettlements ?? []
    const record = {
      id:         crypto.randomUUID(),
      memberId:   child.id,
      settledAt:  new Date().toISOString(),
      amounts,
      total:      amounts.rent + amounts.utilities + amounts.tax,
    }
    await updateFamilyConfig(getFamilyId(), {
      ...family.config,
      expenseSettlements: [...existing, record],
    })
    await reload()
    setSettlingFor(null)
  }

  const grandUnsettled = rows.reduce((sum, r) =>
    sum + r.unsettled.rent + r.unsettled.utilities + r.unsettled.tax, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          Expenses Collected
        </h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>
          Rent, utilities &amp; tax deducted from each child's payslip
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {loading && (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-dim)' }}>
            Loading...
          </p>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-dim)' }}>
            No children yet
          </p>
        )}

        {/* Grand total unsettled banner */}
        {grandUnsettled > 0 && (
          <div className="px-4 py-3 rounded-xl flex items-center justify-between"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <div>
              <p className="text-xs font-mono font-semibold" style={{ color: 'var(--warning)' }}>
                Total not yet set aside
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                Across all children
              </p>
            </div>
            <span className="text-xl font-mono font-bold" style={{ color: 'var(--warning)' }}>
              {fmt(grandUnsettled)}
            </span>
          </div>
        )}

        {!loading && grandUnsettled === 0 && rows.length > 0 && (
          <div className="px-4 py-3 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <p className="text-xs font-mono" style={{ color: 'var(--positive)' }}>
              All collected expenses accounted for
            </p>
          </div>
        )}

        {rows.map(({ child, collected, unsettled, history }) => (
          <ChildExpenseCard
            key={child.id}
            child={child}
            collected={collected}
            unsettled={unsettled}
            history={history}
            fmt={fmt}
            onSettle={() => setSettlingFor({ child, unsettled })}
          />
        ))}

        {/* Explanation note */}
        {rows.length > 0 && (
          <p className="text-xs font-mono text-center px-4 pb-2" style={{ color: 'var(--text-dim)' }}>
            These amounts are deducted from each child's virtual payslip.
            "Settle" means you've set aside the real-world equivalent.
          </p>
        )}
      </div>

      {settlingFor && (
        <SettleSheet
          child={settlingFor.child}
          unsettled={settlingFor.unsettled}
          fmt={fmt}
          onSettle={handleSettle}
          onClose={() => setSettlingFor(null)}
        />
      )}
    </div>
  )
}
