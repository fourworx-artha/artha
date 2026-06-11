import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useFamily, useCurrency, usePeriod } from '../../context/FamilyContext'
import { displayDate, today } from '../../utils/dates'
import { calculatePayslip } from '../../engine/payslip'
import { getChoreLogsForPeriod, getChoreLogsForDate, getChores, getUtilityCharges, makeEarlyRepayment, getLatestPayslip, markCreditPopupSeen, getPayslips, addMemberRequest, getTransactions, getTransactionsForPeriod } from '../../db/operations'
import { calculateStreak, getDueChoresForMember } from '../../engine/chores'
import { getFamilyId } from '../../utils/family'
import { daysAgo } from '../../utils/dates'
import { useStage } from '../../hooks/useStage'
import { useAlerts, alertRoute } from '../../hooks/useAlerts'
import AlertBell from '../../components/AlertBell'
import EventBanner from '../../components/EventBanner'
import EmptyChartNote from '../../components/EmptyChartNote'
import { ChevronRight, X, Landmark } from 'lucide-react'
import CreditScorePopup from '../../components/CreditScorePopup'
import NetWorthChart from '../../components/NetWorthChart'
import SavingsGrowthChart from '../../components/SavingsGrowthChart'
import TopRewardsChart from '../../components/TopRewardsChart'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }) {
  // Show a flat placeholder when not enough data yet
  if (!data || data.length < 2) {
    return (
      <svg viewBox="0 0 200 38" style={{ width: '100%', height: 38, display: 'block' }}>
        <line x1="3" y1="30" x2="197" y2="30"
          stroke={color} strokeWidth="1.5" strokeDasharray="4,4" opacity="0.2"
          strokeLinecap="round" />
      </svg>
    )
  }
  const W = 200, H = 38
  const PAD = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const toX = i => PAD + (i / (data.length - 1)) * (W - PAD * 2)
  const toY = v => (H - PAD) - ((v - min) / range) * (H - PAD * 2)
  const pts = data.map((v, i) => ({ x: toX(i), y: toY(v) }))
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const areaD = [
    `M ${pts[0].x.toFixed(1)} ${H}`,
    ...pts.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${last.x.toFixed(1)} ${H}`,
    'Z',
  ].join(' ')
  // stable gradient ID based on color
  const gid = `spk-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={2.5} fill={color} />
    </svg>
  )
}

// ── Credit score line chart (shared by child Home + parent ChildDetail) ───────
// SVG-based, same style as NetWorthChart but with band-coloured segments + dots.
export function CreditScoreLineChart({ data }) {
  if (!data || data.length < 2) return <EmptyChartNote />

  const bandColor  = (s) => s >= 700 ? '#4ade80' : s >= 500 ? '#D4A017' : '#f87171'
  const bandLabel  = (s) => s >= 700 ? '≥700'    : s >= 500 ? '≥500'    : '<500'

  const W = 300, H = 90, PAD_L = 4, PAD_R = 4, PAD_T = 8, PAD_B = 20
  const inner_w = W - PAD_L - PAD_R
  const inner_h = H - PAD_T - PAD_B

  // Fixed domain 300–850 so the bands are spatially meaningful
  const MIN_SCORE = 300, MAX_SCORE = 850
  const toX = i => PAD_L + (i / (data.length - 1)) * inner_w
  const toY = v => PAD_T + inner_h - ((v - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)) * inner_h

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.score), ...d }))
  const first  = points[0]
  const last   = points[points.length - 1]
  const currentColor = bandColor(last.score)

  // Area fill path (uses the full polyline)
  const areaD = [
    `M ${first.x.toFixed(1)} ${(H - PAD_B).toFixed(1)}`,
    ...points.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${last.x.toFixed(1)} ${(H - PAD_B).toFixed(1)}`,
    'Z',
  ].join(' ')

  // Reference line Y positions
  const y700 = toY(700)
  const y500 = toY(500)

  const gradId = 'cs-area'

  return (
    <div style={{ width: '100%' }}>
      {/* Key: colour-coded numbers only */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {[['#4ade80', '≥700'], ['#D4A017', '≥500'], ['#f87171', '<500']].map(([c, lbl]) => (
          <span key={lbl} style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 600, color: c }}>
            {lbl}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={currentColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={currentColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Reference lines at 700 and 500 */}
        <line x1={PAD_L} y1={y700} x2={W - PAD_R} y2={y700}
          stroke="#4ade80" strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="4,4" />
        <line x1={PAD_L} y1={y500} x2={W - PAD_R} y2={y500}
          stroke="#D4A017" strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="4,4" />

        {/* Line segments coloured by the destination point's band */}
        {points.slice(1).map((p, i) => (
          <line key={i}
            x1={points[i].x.toFixed(1)} y1={points[i].y.toFixed(1)}
            x2={p.x.toFixed(1)}         y2={p.y.toFixed(1)}
            stroke={bandColor(p.score)} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
          />
        ))}

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y}
            r={i === points.length - 1 ? 3 : 2}
            fill={bandColor(p.score)}
            stroke="var(--bg-surface)" strokeWidth="1.2"
          />
        ))}

        {/* X-axis labels: first and last only */}
        <text x={first.x} y={H} textAnchor="middle"
          fontSize="7" fontFamily="monospace" fill="var(--text-dim)">{first.label}</text>
        <text x={last.x} y={H} textAnchor="middle"
          fontSize="7" fontFamily="monospace" fill="var(--text-dim)">{last.label}</text>
      </svg>
    </div>
  )
}

// ── Prepayment sheet ──────────────────────────────────────────────────────────
function PrepaySheet({ loan, spending, memberId, onDone, onClose, fmt }) {
  const outstanding    = loan.outstanding
  const [amount, setAmount] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [cleared, setCleared] = useState(false)
  const [error,   setError]   = useState('')

  const max    = Math.min(outstanding, spending)
  const parsed = Math.min(Number(amount) || 0, max)

  const QUICK = [
    { label: '25%', val: Math.floor(outstanding * 0.25) },
    { label: '50%', val: Math.floor(outstanding * 0.50) },
    { label: '75%', val: Math.floor(outstanding * 0.75) },
    { label: 'All',  val: Math.min(outstanding, spending)  },
  ].filter(q => q.val > 0)

  const handlePay = async () => {
    if (!parsed || parsed <= 0) { setError('Enter an amount'); return }
    setSaving(true)
    setError('')
    try {
      const remaining = await makeEarlyRepayment(memberId, parsed)
      if (remaining === 0) {
        setCleared(true)
        setTimeout(() => { onDone(); onClose() }, 1800)
      } else {
        onDone()
        onClose()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Pay Off Loan Early
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {cleared ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <span className="text-5xl">🎉</span>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--positive)' }}>
              Loan fully cleared!
            </p>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>OUTSTANDING</p>
                <p className="text-base font-mono font-bold mt-0.5" style={{ color: 'var(--warning)' }}>
                  {fmt(outstanding)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>AVAILABLE</p>
                <p className="text-base font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>
                  {fmt(spending)}
                </p>
              </div>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2">
              {QUICK.map(q => (
                <button key={q.label} onClick={() => setAmount(String(q.val))}
                  className="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition-all"
                  style={{
                    background: amount === String(q.val) ? 'rgba(251,191,36,0.2)' : 'var(--bg-raised)',
                    border: `1px solid ${amount === String(q.val) ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`,
                    color: amount === String(q.val) ? 'var(--warning)' : 'var(--text-muted)',
                  }}>
                  {q.label}
                </button>
              ))}
            </div>

            <input
              type="number" min={1} max={max} value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Custom amount"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />

            {parsed > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>After payment</span>
                <span className="text-xs font-mono font-semibold" style={{ color: parsed >= outstanding ? 'var(--positive)' : 'var(--warning)' }}>
                  {parsed >= outstanding ? '🎉 Fully cleared!' : `${fmt(outstanding - parsed)} remaining`}
                </span>
              </div>
            )}

            {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

            <button onClick={handlePay} disabled={saving || !parsed}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{
                background: saving || !parsed ? 'var(--border)' : 'rgba(251,191,36,0.2)',
                border: '1px solid rgba(251,191,36,0.35)',
                color: saving || !parsed ? 'var(--text-dim)' : 'var(--warning)',
              }}>
              {saving ? 'Processing...' : `Pay ${parsed ? fmt(parsed) : '—'} Now`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Donate sheet (request donation from philanthropy balance) ─────────────────
function DonateSheet({ philanthropy, memberId, onClose, fmt }) {
  const [charity, setCharity] = useState('')
  const [amount,  setAmount]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  const max    = philanthropy
  const parsed = Math.min(Number(amount) || 0, max)

  const handleSubmit = async () => {
    if (!charity.trim())        { setError('Enter a charity name'); return }
    if (!parsed || parsed <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      await addMemberRequest({
        id: crypto.randomUUID(),
        familyId: getFamilyId(),
        memberId,
        type: 'donation',
        amount: parsed,
        description: `Donate to ${charity.trim()}`,
        metadata: { charityName: charity.trim() },
        requestedAt: Date.now(),
      })
      setDone(true)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
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
            Request Donation
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>
        {done ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 px-4">
            <span className="text-5xl">🙏</span>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--positive)' }}>Request sent to parent!</p>
            <p className="text-xs font-mono text-center" style={{ color: 'var(--text-muted)' }}>
              Your parent will approve the donation.
            </p>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold mt-2"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Close
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-4">
            <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PHILANTHROPY BALANCE</p>
              <p className="text-base font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>{fmt(max)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>CHARITY NAME</label>
              <input value={charity} onChange={e => setCharity(e.target.value)}
                placeholder="e.g. Local animal shelter"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>AMOUNT</label>
              <div className="flex gap-2 mb-1">
                {[25, 50, 100].filter(v => v <= max).map(v => (
                  <button key={v} onClick={() => setAmount(String(v))}
                    className="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition-all"
                    style={{
                      background: amount === String(v) ? 'rgba(74,222,128,0.15)' : 'var(--bg-raised)',
                      border: `1px solid ${amount === String(v) ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                      color: amount === String(v) ? 'var(--positive)' : 'var(--text-muted)',
                    }}>{fmt(v)}</button>
                ))}
              </div>
              <input type="number" min={1} max={max} value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Custom amount"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}
            <button onClick={handleSubmit} disabled={saving || !parsed || !charity.trim()}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{
                background: saving || !parsed ? 'var(--border)' : 'rgba(74,222,128,0.15)',
                border: '1px solid rgba(74,222,128,0.3)',
                color: saving || !parsed ? 'var(--text-dim)' : 'var(--positive)',
              }}>
              {saving ? 'Sending...' : `Request ${parsed ? fmt(parsed) : '—'} donation`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Spending history sheet ─────────────────────────────────────────────────────
const SPENDING_TYPE_META = {
  reward:     { label: 'Reward store',   emoji: '🛍' },
  withdrawal: { label: 'Withdrawal',     emoji: '💸' },
  transfer:   { label: 'Transfer',       emoji: '↗' },
}
const SPENDING_TYPES = new Set(['reward', 'withdrawal', 'transfer'])

function SpendingSheet({ memberId, onClose, fmt }) {
  const [txs,     setTxs]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTransactions(memberId, 60).then(all => {
      setTxs(all.filter(t => SPENDING_TYPES.has(t.type)))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [memberId])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: '75vh' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Spending History
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {loading && (
            <p className="text-xs font-mono text-center py-6" style={{ color: 'var(--text-dim)' }}>Loading...</p>
          )}
          {!loading && (!txs || txs.length === 0) && (
            <p className="text-xs font-mono text-center py-6" style={{ color: 'var(--text-dim)' }}>
              No spending yet — rewards and transfers will appear here
            </p>
          )}
          {(txs ?? []).map(tx => {
            const meta = SPENDING_TYPE_META[tx.type] ?? { label: tx.type, emoji: '•' }
            return (
              <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {tx.description || meta.label}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{tx.date}</p>
                </div>
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--negative)' }}>
                  −{fmt(Math.abs(tx.amount))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Net Worth breakdown sheet ──────────────────────────────────────────────────
function NetWorthSheet({ accounts, subGoals, subGoalTotal, totalSavings, fmt, onClose }) {
  const spending    = accounts.spending ?? 0
  const savings     = accounts.savings ?? 0
  const philanthropy = accounts.philanthropy ?? 0
  const loan        = accounts.loan?.outstanding ?? 0
  const netWorth    = spending + totalSavings + philanthropy - loan

  const Row = ({ label, value, color, indent = false, sub = false }) => (
    <div className={`flex items-center justify-between py-2 ${indent ? 'pl-6' : ''}`}
      style={{ borderBottom: '1px solid var(--border)' }}>
      <span style={{
        fontFamily: 'monospace', fontSize: sub ? 10 : 12,
        color: sub ? 'var(--text-dim)' : 'var(--text-muted)',
      }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: sub ? 10 : 12, fontWeight: 600,
        color: color ?? 'var(--text-primary)',
      }}>{value}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: '80vh' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Net Worth Breakdown
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 flex flex-col">
          {/* Assets */}
          <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>ASSETS</p>
          <Row label="Spending wallet"  value={fmt(spending)}     color="var(--positive)" />
          <Row label="Savings account"  value={fmt(savings)}      color="#60a5fa" />
          {subGoals.map(g => (
            <Row key={g.id}
              label={`↳ ${g.name}`}
              value={`${fmt(g.balance)} / ${fmt(g.target)}`}
              color="#818cf8" indent sub />
          ))}
          {subGoals.length > 0 && (
            <Row label="Sub-goals total" value={fmt(subGoalTotal)} color="#818cf8" indent />
          )}
          <Row label="Philanthropy"     value={fmt(philanthropy)} color="#D4A017" />

          {/* Liabilities */}
          {loan > 0 && (
            <>
              <p className="text-xs font-mono mt-3 mb-1" style={{ color: 'var(--text-dim)' }}>LIABILITIES</p>
              <Row label="Loan outstanding" value={`−${fmt(loan)}`} color="var(--negative)" />
            </>
          )}

          {/* Net total */}
          <div className="flex items-center justify-between mt-4 px-3 py-3 rounded-xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-bright)' }}>
            <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>NET WORTH</span>
            <span className="text-lg font-mono font-bold"
              style={{ color: netWorth >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
              {fmt(netWorth)}
            </span>
          </div>
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}

// ── Cash / Bank out sheet (spending wallet withdrawal request) ─────────────────
function CashOutSheet({ spending, memberId, onClose, fmt }) {
  const [dest,    setDest]    = useState('cash')
  const [amount,  setAmount]  = useState('')
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  const max    = spending
  const parsed = Math.min(Number(amount) || 0, max)

  const DEST_OPTIONS = [
    { id: 'cash', label: 'Physical Cash', hint: 'Parent hands you cash' },
    { id: 'bank', label: 'Bank Transfer', hint: 'Transferred to your bank' },
  ]

  const handleSubmit = async () => {
    if (!parsed || parsed <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      await addMemberRequest({
        id: crypto.randomUUID(),
        familyId: getFamilyId(),
        memberId,
        type: 'cash_withdrawal',
        amount: parsed,
        description: `Wallet withdrawal — ${dest === 'cash' ? 'Physical cash' : 'Bank transfer'}${note.trim() ? ': ' + note.trim() : ''}`,
        metadata: { destination: dest, note: note.trim() },
        requestedAt: Date.now(),
      })
      setDone(true)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
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
            Withdraw from Wallet
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 px-4">
            <span className="text-5xl">💸</span>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--positive)' }}>Request sent!</p>
            <p className="text-xs font-mono text-center" style={{ color: 'var(--text-muted)' }}>
              Your parent will approve and hand over the {dest === 'cash' ? 'cash' : 'bank transfer'}.
            </p>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold mt-2"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Close
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Balance */}
            <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-raised)' }}>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>WALLET BALANCE</p>
              <p className="text-base font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>{fmt(max)}</p>
            </div>

            {/* Destination */}
            <div className="flex gap-2">
              {DEST_OPTIONS.map(opt => (
                <button key={opt.id} onClick={() => setDest(opt.id)}
                  className="flex-1 py-2.5 px-2 rounded-xl flex flex-col items-start gap-0.5 transition-all"
                  style={{
                    background: dest === opt.id ? 'rgba(96,165,250,0.12)' : 'var(--bg-raised)',
                    border: `1px solid ${dest === opt.id ? 'rgba(96,165,250,0.4)' : 'var(--border)'}`,
                  }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                    color: dest === opt.id ? '#60a5fa' : 'var(--text-primary)' }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                {[25, 50, 100, 200].filter(v => v <= max).map(v => (
                  <button key={v} onClick={() => setAmount(String(v))}
                    className="flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition-all"
                    style={{
                      background: amount === String(v) ? 'rgba(96,165,250,0.12)' : 'var(--bg-raised)',
                      border: `1px solid ${amount === String(v) ? 'rgba(96,165,250,0.3)' : 'var(--border)'}`,
                      color: amount === String(v) ? '#60a5fa' : 'var(--text-muted)',
                    }}>{fmt(v)}</button>
                ))}
              </div>
              <input type="number" min={1} max={max} value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Custom amount"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Optional note */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>NOTE (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Road trip spending money"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {parsed > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Wallet after approval</span>
                <span className="text-xs font-mono font-semibold" style={{ color: '#60a5fa' }}>
                  {fmt(max - parsed)} left
                </span>
              </div>
            )}

            {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

            <button onClick={handleSubmit} disabled={saving || !parsed}
              className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{
                background: saving || !parsed ? 'var(--border)' : 'rgba(96,165,250,0.15)',
                border: '1px solid rgba(96,165,250,0.3)',
                color: saving || !parsed ? 'var(--text-dim)' : '#60a5fa',
              }}>
              {saving ? 'Sending...' : `Request ${parsed ? fmt(parsed) : '—'} withdrawal`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChildHome() {
  const { currentMember, refreshMember } = useAuth()
  const { family, chores, reloadCount } = useFamily()
  const navigate = useNavigate()
  const fmt = useCurrency()
  const { periodStart, periodEnd, progressPeriodStart, progressPeriodEnd, label: periodLabel } = usePeriod()
  const { has, settledCount, loading: stageLoading } = useStage(currentMember)  // W6 feature gating
  const { banners, markRead, dismiss } = useAlerts()  // W7 alert rows for banners

  const [choresDueCount,  setChoresDueCount]  = useState(0)
  const [choresThisWeek,  setChoresThisWeek]  = useState(0)
  const [projected,       setProjected]       = useState(null)
  const [streak,          setStreak]          = useState(0)
  const [showPrepay,      setShowPrepay]      = useState(false)
  const [showDonate,      setShowDonate]      = useState(false)
  const [showSpending,    setShowSpending]    = useState(false)
  const [showNetWorth,    setShowNetWorth]    = useState(false)
  const [showCashOut,     setShowCashOut]     = useState(false)
  const [creditPopup,     setCreditPopup]     = useState(null) // { score, prevScore }
  const [latestPayslip,   setLatestPayslip]   = useState(null)
  const [payslips,        setPayslips]        = useState([])
  const [allTxns,         setAllTxns]         = useState([])

  // Refresh member data each time this view mounts so balance reflects
  // any payslip or bonus credits that happened since login.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshMember() }, [])

  // Load payslips for charts, then load all transactions since earliest payslip
  useEffect(() => {
    if (!currentMember) return
    getPayslips(currentMember.id).then(async ps => {
      const settled = ps
        .filter(p => p.status === 'settled')
        .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
      setPayslips(settled)
      // Load all transactions from the earliest payslip onwards for spent calculations
      const earliest = settled.length > 0 ? settled[0].periodStart : progressPeriodStart
      const txns = await getTransactionsForPeriod(currentMember.id, earliest, '2099-12-31').catch(() => [])
      setAllTxns(txns)
    }).catch(() => {})
  }, [currentMember?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Credit score popup — show once per pay period; also cache latestPayslip for on-demand tap
  useEffect(() => {
    if (!currentMember || !periodEnd || !has('creditScore')) return
    const score = currentMember.creditScore ?? 500
    getLatestPayslip(currentMember.id)
      .then(payslip => {
        setLatestPayslip(payslip)
        if (currentMember.lastCreditPopupPeriod !== periodEnd) {
          setCreditPopup({ score, prevScore: payslip?.creditScore ?? null })
        }
      })
      .catch(() => {})
  }, [currentMember?.id, periodEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismissCredit = async () => {
    setCreditPopup(null)
    if (currentMember) await markCreditPopupSeen(currentMember.id, periodEnd).catch(() => {})
  }

  // W7 computed banner: chores still to do today (no table row — derived live;
  // pending counts as done, same as everywhere else)
  useEffect(() => {
    if (!currentMember) return
    const due = getDueChoresForMember(chores, currentMember.id)
    if (!due.length) { setChoresDueCount(0); return }
    getChoreLogsForDate(currentMember.id, today()).then(logs => {
      const remaining = due.filter(c => {
        const log = logs.find(l => l.choreId === c.id)
        return !log || log.status === 'rejected'
      }).length
      setChoresDueCount(remaining)
    }).catch(() => {})
  }, [currentMember?.id, chores, reloadCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute projected earnings + streak for current period
  const loadProjected = useCallback(async () => {
    if (!currentMember || !family) return
    try {
      const [allChores, choreLogs, utilityCharges, streakLogs] = await Promise.all([
        getChores(getFamilyId()),
        getChoreLogsForPeriod(currentMember.id, progressPeriodStart, progressPeriodEnd),
        getUtilityCharges(currentMember.id, progressPeriodStart, progressPeriodEnd),
        getChoreLogsForPeriod(currentMember.id, daysAgo(60), progressPeriodEnd),
      ])

      const mandatoryChores = allChores.filter(c =>
        c.type === 'mandatory' && c.isActive && c.assignedTo.includes(currentMember.id)
      )
      const streakDays = calculateStreak(streakLogs, mandatoryChores)
      setStreak(streakDays)
      // W8 first-payday card: chores done so far this period (pending counts)
      setChoresThisWeek(choreLogs.filter(l => l.status !== 'rejected').length)

      const effectiveConfig = currentMember.config
        ? { ...family.config, ...currentMember.config }
        : family.config

      // Use last settled payslip's closing balance as opening for interest (prevents gaming)
      const lastSettled   = payslips[payslips.length - 1]
      const openingSavings  = lastSettled?.balancesAfter?.savings  ?? null
      const openingSubGoals = lastSettled?.balancesAfter?.subGoals ?? null

      const calc = calculatePayslip({
        member: currentMember,
        familyConfig: effectiveConfig,
        allChores,
        choreLogs,
        utilityCharges,
        periodStart: progressPeriodStart,
        periodEnd:   progressPeriodEnd,
        streakDays,
        openingSavings,
        openingSubGoals,
      })

      // ── Mandatory % over FULL period (all days, not just days with logs) ──
      const start = new Date(progressPeriodStart + 'T12:00:00')
      const end   = new Date(progressPeriodEnd   + 'T12:00:00')
      const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
      let totalExpected = 0
      let totalApproved = 0
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const day = d.getDay()
        const dateStr = d.toISOString().split('T')[0]
        for (const chore of mandatoryChores) {
          let due = false
          switch (chore.recurrence) {
            case 'daily':   due = true; break
            case 'weekday': due = day >= 1 && day <= 5; break
            case 'weekend': due = day === 0 || day === 6; break
            case 'weekly':  due = day === 1; break
            case 'custom':  due = true; break
          }
          if (due) {
            totalExpected++
            if (choreLogs.some(l => l.choreId === chore.id && l.date === dateStr && l.status === 'approved'))
              totalApproved++
          }
        }
      }
      const mandatoryPct = totalExpected > 0 ? Math.round(totalApproved / totalExpected * 100) : 0

      // Use locally-computed mandatoryPct (counts all elapsed days, not just logged days)
      // calc.earnings.adjustedSalary defaults to full salary when no logs exist — wrong for projection
      const choreEarned = Math.round(currentMember.baseSalary * mandatoryPct / 100)

      setProjected({
        choreEarned,
        chorePotential: currentMember.baseSalary,        // max salary (no streak mixed in)
        streakEarned:   calc.earnings.streakBonus,
        streakPotential: Math.round(currentMember.baseSalary * calc.earnings.streakBonusPct),
        mandatoryPct,
        bonusEarned:    calc.earnings.bonusChoreEarnings,
        bonusPotential: calc.bonusPotential ?? 0,
        interest:       (calc.interestEarned ?? 0) + (calc.subGoalInterestEarned ?? 0),
        streakBonus:    calc.earnings.streakBonus,
        streakBonusPct: calc.earnings.streakBonusPct,
      })
    } catch { /* silent — projection is non-critical */ }
  }, [currentMember, family, progressPeriodStart, progressPeriodEnd])

  useEffect(() => { loadProjected() }, [loadProjected])

  const accounts        = currentMember?.accounts ?? {}
  const philanthropy    = accounts.philanthropy ?? 0
  const loanOutstanding = accounts.loan?.outstanding ?? 0
  const subGoals        = accounts.subGoals ?? []
  const subGoalTotal    = subGoals.reduce((s, g) => s + (g.balance ?? 0), 0)
  const totalSavings    = (accounts.savings ?? 0) + subGoalTotal
  const interestRate    = has('interest')
    ? ((currentMember?.config?.interestRate ?? family?.config?.interestRate) ?? 0)
    : 0
  const walletInterestPotential = Math.round((accounts.spending ?? 0) * interestRate)

  // ── Hero card data ───────────────────────────────────────────────────────────
  // Wallet sparkline: spending balance per settled payslip
  const walletHistory = payslips.map(p => p.balancesAfter?.spending ?? 0)

  // Only reward purchases and cash/bank withdrawals count as "spent"
  const SPENT_TYPES = new Set(['reward', 'withdrawal'])
  const spentTxns = allTxns.filter(t => SPENT_TYPES.has(t.type))

  // Spent per period: sum of reward+withdrawal txns within each payslip period
  const spentHistory = payslips.map(p =>
    spentTxns
      .filter(t => t.date >= p.periodStart && t.date <= p.periodEnd)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
  )

  // Spent this period = reward+withdrawal txns since progressPeriodStart
  const spentThisPeriod = allTxns.length > 0 || payslips.length > 0
    ? spentTxns
        .filter(t => t.date >= progressPeriodStart)
        .reduce((s, t) => s + Math.abs(t.amount), 0)
    : null

  const prevPeriodSpent = spentHistory.length >= 1
    ? spentHistory[spentHistory.length - 1]
    : null

  // Wallet delta vs last payslip
  const lastSettledWallet = payslips.length > 0 ? (payslips[payslips.length - 1].balancesAfter?.spending ?? 0) : null
  const walletDelta = lastSettledWallet !== null
    ? (accounts.spending ?? 0) - lastSettledWallet
    : null

  // ── Chart data ───────────────────────────────────────────────────────────────
  const netWorthData = payslips.map(p => {
    const b = p.balancesAfter ?? {}
    const goalsTotal = (b.subGoals ?? []).reduce((s, g) => s + (g.balance ?? 0), 0)
    const nw = (b.spending ?? 0) + (b.savings ?? 0) + goalsTotal + (b.philanthropy ?? 0) - (b.loan?.outstanding ?? 0)
    const d = new Date(p.periodEnd + 'T12:00:00')
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase().replace(' ', '-')
    return { label, value: nw }
  })

  const savingsHistory = payslips.map(p => {
    const b = p.balancesAfter ?? {}
    return (b.savings ?? 0) + (b.subGoals ?? []).reduce((s, g) => s + (g.balance ?? 0), 0)
  })

  // Cumulative donations over time: whenever philanthropy balance drops between
  // payslips that means a donation happened. Flat line = not giving = problem.
  const cumulativeDonations = (() => {
    let total = 0
    return payslips.map((p, i) => {
      const prev = i === 0 ? (p.balancesAfter?.philanthropy ?? 0) : (payslips[i - 1].balancesAfter?.philanthropy ?? 0)
      const curr = p.balancesAfter?.philanthropy ?? 0
      const alloc = p.allocations?.philanthropy ?? 0
      // drop beyond what was allocated = donations made this period
      const donated = Math.max(0, prev + alloc - curr)
      total += donated
      return total
    })
  })()

  const savingsActual = payslips.map(p => {
    const b = p.balancesAfter ?? {}
    const d = new Date(p.periodEnd + 'T12:00:00')
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase().replace(' ', '-')
    const goalsTotal = (b.subGoals ?? []).reduce((s, g) => s + (g.balance ?? 0), 0)
    return { label, value: (b.savings ?? 0) + goalsTotal }
  })

  const creditChartData = payslips
    .filter(p => p.creditScore != null)
    .map(p => {
      const d = new Date(p.periodEnd + 'T12:00:00')
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase().replace(' ', '-')
      return { label, score: p.creditScore }
    })

  const pLabel = p => {
    const d = new Date(p.periodEnd + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase().replace(' ', '-')
  }

  const mandatoryChartData = payslips.map(p => {
    const earned = p.earnings?.adjustedSalary ?? 0
    const base   = p.earnings?.baseSalary ?? 0
    return { period: pLabel(p), earned, uncaptured: Math.max(0, base - earned), pct: base > 0 ? Math.round(earned / base * 100) : 0 }
  })

  const allocationChartData = payslips.map(p => ({
    period:      pLabel(p),
    obligations: (p.deductions?.tax ?? 0) + (p.deductions?.rent ?? 0) + (p.deductions?.totalUtilities ?? 0) + (p.deductions?.loanRepayment ?? 0),
    savings:     p.allocations?.savings ?? 0,
    philanthropy: p.allocations?.philanthropy ?? 0,
    wallet:      p.allocations?.spending ?? 0,
  }))

  const bonusChartData = payslips
    .filter(p => (p.bonusPotential ?? 0) > 0)
    .map(p => {
      const earned = p.earnings?.bonusChoreEarnings ?? 0
      const potential = p.bonusPotential ?? 0
      return { period: pLabel(p), earned, uncaptured: Math.max(0, potential - earned), pct: potential > 0 ? Math.round(earned / potential * 100) : 0 }
    })

  const savingsProjected = (() => {
    const periodicSavings = projected?.savings ?? 0
    let balance = totalSavings
    return Array.from({ length: 8 }, (_, i) => {
      balance = (balance * (1 + interestRate)) + periodicSavings
      return { label: `+${i + 1}`, value: Math.round(balance) }
    })
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {displayDate(today()).toUpperCase()}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {currentMember?.avatar} {currentMember?.name}
          </h2>
          <div className="flex items-center gap-2">
            <AlertBell />
            {has('streaks') && streak >= 3 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.25)' }}>
                🔥 {streak}d streak
              </span>
            )}
            {has('creditScore') && (() => {
              const score = currentMember?.creditScore ?? 500
              const color = score >= 700 ? 'var(--positive)' : score >= 500 ? 'var(--warning)' : 'var(--negative)'
              const bg    = score >= 700 ? 'rgba(74,222,128,0.1)' : score >= 500 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)'
              return (
                <button
                  onClick={() => setCreditPopup({ score, prevScore: latestPayslip?.creditScore ?? null })}
                  className="text-xs font-mono px-2 py-0.5 rounded-full active:scale-95"
                  style={{ background: bg, color, border: `1px solid ${bg}` }}>
                  ★ {score}
                </button>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {/* W7 event banners — payday / stage / reward / all-done alert rows +
            the computed chores_due item (absorbed the old reward toast) */}
        <EventBanner
          banners={banners}
          computed={choresDueCount > 0 ? [{
            key:   'choresdue',
            type:  'chores_due',
            title: `📋 You have ${choresDueCount} chore${choresDueCount === 1 ? '' : 's'} to do today`,
            onTap: () => navigate('/child/chores'),
          }] : []}
          onDismiss={a => dismiss(a.id)}
          onTap={a => { markRead(a.id); navigate(alertRoute(a, 'child')) }}
        />

        {/* W8 — first-payday card: shown until the first settled payslip;
            steps aside once the first draft is waiting (its banner takes over) */}
        {!stageLoading && settledCount === 0 && latestPayslip?.status !== 'draft' && (
          <div className="px-4 py-3 rounded-xl flex flex-col gap-1"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-bright)' }}>
            <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              🗓️ Your first payday is {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][family?.config?.paydayDow ?? 6]}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Every chore you do this week becomes money.
            </p>
            <p className="text-xs font-mono mt-1" style={{ color: choresThisWeek > 0 ? 'var(--positive)' : 'var(--text-dim)' }}>
              {choresThisWeek} chore{choresThisWeek === 1 ? '' : 's'} done so far this week
            </p>
          </div>
        )}

        {/* Vacation banner */}
        {currentMember?.config?.vacation?.active && (
          <div className="px-4 py-3 rounded-xl flex flex-col gap-1"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)' }}>
            <p className="text-sm font-mono font-semibold" style={{ color: '#60a5fa' }}>
              ✈️ {currentMember.config.vacation.paidLeave ? 'Paid Leave' : 'Unpaid Leave'} this period
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {currentMember.config.vacation.paidLeave
                ? 'Full salary incoming — chores are optional, enjoy your break!'
                : 'No salary this period, but no penalties either. Your savings are still earning interest.'}
            </p>
          </div>
        )}

        {/* Draft payslip banner */}
        {latestPayslip?.status === 'draft' && (
          <button
            onClick={() => navigate('/child/ledger')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-95"
            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)' }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono font-semibold" style={{ color: 'var(--warning)' }}>
                New payslip ready
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                Waiting for parent to approve · tap to view
              </p>
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>→</span>
          </button>
        )}

        {/* Hero row: Wallet + Spent */}
        <div className="grid grid-cols-2 gap-3">
          {/* Wallet card — tap → Wallet screen (spend + transfer) */}
          <button onClick={() => navigate('/child/wallet')}
            className="p-4 rounded-xl flex flex-col text-left transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>WALLET</p>
            <p className="text-2xl font-mono font-bold mt-1" style={{ color: 'var(--positive)' }}>
              {fmt(accounts.spending ?? 0)}
            </p>
            {walletDelta !== null && (
              <p className="text-xs font-mono mt-1" style={{
                color: walletDelta >= 0 ? 'var(--positive)' : 'var(--negative)',
              }}>
                {walletDelta >= 0 ? '+' : ''}{fmt(walletDelta)} since last pay
              </p>
            )}
            {has('sparklines') && (
              <div className="mt-2 -mx-1">
                <Sparkline data={walletHistory} color="#4ade80" />
              </div>
            )}
            <p className="text-xs font-mono mt-1 flex items-center gap-0.5" style={{ color: 'var(--text-dim)' }}>
              Spend &amp; transfer <ChevronRight size={11} />
            </p>
          </button>

          {/* Spent card */}
          <button onClick={() => setShowSpending(true)}
            className="p-4 rounded-xl text-left transition-all active:scale-95 flex flex-col"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SPENT</p>
            <p className="text-2xl font-mono font-bold mt-1"
              style={{ color: spentThisPeriod > 0 ? 'var(--negative)' : 'var(--text-dim)' }}>
              {spentThisPeriod !== null ? fmt(spentThisPeriod) : '—'}
            </p>
            {prevPeriodSpent !== null && (
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--negative)' }}>
                {fmt(prevPeriodSpent)} last period
              </p>
            )}
            {has('sparklines') && (
              <div className="mt-2 -mx-1">
                <Sparkline data={spentHistory} color="#f87171" />
              </div>
            )}
            <p className="text-xs font-mono mt-1 flex items-center gap-0.5" style={{ color: 'var(--text-dim)' }}>
              View spending <ChevronRight size={11} />
            </p>
          </button>
        </div>

        {/* Savings + Philanthropy row — savings at Saver, philanthropy at Economist */}
        {(has('savings') || has('philanthropy')) && (
        <div className={`grid ${has('savings') && has('philanthropy') ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
          {has('savings') && (
          <button onClick={() => navigate('/child/savings')}
            className="p-4 rounded-xl text-left transition-all active:scale-95 flex flex-col"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SAVINGS</p>
            <p className="text-2xl font-mono font-bold mt-1" style={{ color: '#1E3A8A' }}>
              {fmt(totalSavings)}
            </p>
            {subGoals.length > 0 && (
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>
                incl. {fmt(subGoalTotal)} in {subGoals.length} goal{subGoals.length > 1 ? 's' : ''}
              </p>
            )}
            <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              {+(interestRate * 100).toFixed(2)}%/{periodLabel} interest
            </p>
            {has('sparklines') && (
              <div className="mt-2 -mx-1">
                <Sparkline data={savingsHistory} color="#1E3A8A" />
              </div>
            )}
          </button>
          )}

          {has('philanthropy') && (
          <button onClick={() => setShowDonate(true)}
            className="p-4 rounded-xl text-left transition-all active:scale-95 flex flex-col"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PHILANTHROPY</p>
            <p className="text-2xl font-mono font-bold mt-1" style={{ color: '#D4A017' }}>
              {fmt(philanthropy)}
            </p>
            <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              cumulative donations ↑
            </p>
            <div className="mt-2 -mx-1">
              <Sparkline data={cumulativeDonations} color="#D4A017" />
            </div>
            <p className="text-xs font-mono mt-1 flex items-center gap-0.5" style={{ color: 'var(--text-dim)' }}>
              Donate <ChevronRight size={11} />
            </p>
          </button>
          )}
        </div>
        )}

        {/* Outstanding loan chip — tap to prepay */}
        {has('loans') && loanOutstanding > 0 && (
          <button
            onClick={() => setShowPrepay(true)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl w-full text-left transition-all active:scale-95"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            <span className="text-base">🤝</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
                Loan outstanding: {fmt(loanOutstanding)}
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                {fmt(accounts.loan.weeklyRepayment)}/{periodLabel} on payslip · tap to pay early
              </p>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          </button>
        )}

        {/* Projected earnings widget */}
        {projected !== null && (() => {
          const totalEarned    = projected.choreEarned + projected.streakEarned + projected.bonusEarned + (projected.interest ?? 0)
          const totalPotential = projected.chorePotential + projected.streakPotential + (projected.bonusPotential ?? 0) + (projected.interest ?? 0)
          const pctColor       = projected.mandatoryPct === 100 ? 'var(--positive)' : 'var(--warning)'
          const pctBg          = projected.mandatoryPct === 100 ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.1)'

          const barHue   = Math.round(projected.mandatoryPct * 1.2)  // 0=red → 120=green
          const barColor = `hsl(${barHue}, 75%, 48%)`
          const barGlow  = `hsl(${barHue}, 75%, 62%)`

          const Frac = ({ top, bot, label, color, flat = false }) => (
            <div className="flex flex-col items-center" style={{ minWidth: 40 }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1.1 }}>{top}</span>
              {flat
                ? <div style={{ height: 4 }} />
                : <div style={{ width: '100%', height: 1, background: 'var(--border-bright)', margin: '3px 0' }} />
              }
              <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: flat ? 'transparent' : 'var(--text-primary)', lineHeight: 1.1, opacity: flat ? 0 : 0.55 }}>{flat ? '—' : bot}</span>
              <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'var(--text-dim)', marginTop: 3, letterSpacing: '0.05em' }}>{label}</span>
            </div>
          )
          const Op = ({ ch }) => (
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-dim)', alignSelf: 'center', paddingBottom: 12 }}>{ch}</span>
          )

          return (
            <div className="px-3 py-3 rounded-xl flex flex-col gap-3"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                PROJECTED {periodLabel.toUpperCase()} PAY
              </span>

              {/* Equation row */}
              <div className="flex items-start gap-2 flex-wrap">
                <Frac top={fmt(projected.choreEarned)} bot={fmt(projected.chorePotential)} label="CHORES" color={pctColor} />
                {projected.bonusPotential > 0 && <>
                  <Op ch="+" />
                  <Frac top={fmt(projected.bonusEarned)} bot={fmt(projected.bonusPotential)} label="BONUS" color="var(--warning)" />
                </>}
                {(projected.interest ?? 0) > 0 && <>
                  <Op ch="+" />
                  <Frac top={fmt(projected.interest)} bot="—" label="INTEREST" color="#60a5fa" flat />
                </>}
                <Op ch="=" />
                <Frac top={fmt(totalEarned)} bot={fmt(totalPotential)} label="TOTAL" color="var(--positive)" />
              </div>

              {/* Chore completion gradient progress bar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>CHORES COMPLETED</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: barColor, fontWeight: 700 }}>
                    {projected.mandatoryPct}%
                    {projected.streakBonus > 0 ? `  🔥 ${streak}d +${fmt(projected.streakBonus)}` : ''}
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: 'var(--bg-raised)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${projected.mandatoryPct}%`,
                    borderRadius: 99,
                    background: `linear-gradient(90deg, hsl(${Math.max(0, barHue - 25)}, 75%, 42%), ${barColor})`,
                    boxShadow: projected.mandatoryPct > 0 ? `0 0 8px ${barGlow}` : 'none',
                    transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
              </div>

              {/* Wallet nudge */}
              {(accounts.spending ?? 0) > 0 && walletInterestPotential > 0 && (
                <p className="text-xs font-mono px-2.5 py-2 rounded-lg" style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)' }}>
                  💡 {fmt(accounts.spending)} in wallet earns {fmt(0)} interest. Move to savings before this period ends to earn ~{fmt(walletInterestPotential)} next period.
                </p>
              )}
            </div>
          )
        })()}

        {/* ── Stats section — savings charts at Saver, full set at Investor+ ── */}
        {has('savingsProjection') && (
        <p className="text-xs font-mono px-1 mt-1" style={{ color: 'var(--text-muted)' }}>STATS</p>
        )}

        {/* Family Fund card */}
        {has('familyFund') && (
        <button onClick={() => navigate('/child/family-fund')}
          className="flex items-center justify-between px-4 py-3 rounded-xl w-full text-left transition-all active:scale-95"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <Landmark size={18} style={{ color: 'var(--text-muted)' }} />
            <div>
              <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                Family Fund
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {fmt(family?.taxFundBalance ?? 0)} collected · tap to see your contributions
              </p>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text-dim)' }} />
        </button>
        )}

        {/* Net worth over time */}
        {has('netWorth') && (
        <button onClick={() => setShowNetWorth(true)} className="p-4 rounded-xl flex flex-col gap-2 w-full text-left transition-all active:scale-95"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>NET WORTH OVER TIME</p>
            <span className="text-xs font-mono flex items-center gap-0.5" style={{ color: 'var(--text-dim)' }}>
              breakdown <ChevronRight size={11} />
            </span>
          </div>
          <NetWorthChart data={netWorthData} />
        </button>
        )}

        {/* Savings growth + projection */}
        {has('savingsProjection') && (
        <button onClick={() => navigate('/child/savings')} className="p-4 rounded-xl flex flex-col gap-2 w-full text-left transition-all active:scale-95"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SAVINGS GROWTH</p>
          <SavingsGrowthChart actualData={savingsActual} projected={savingsProjected} />
        </button>
        )}

        {/* Credit score history */}
        {has('creditScore') && creditChartData.length >= 2 && (
          <div className="p-4 rounded-xl flex flex-col gap-2"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>CREDIT SCORE</p>
              <span className="text-xs font-mono" style={{
                color: (currentMember?.creditScore ?? 500) >= 700 ? 'var(--positive)' : (currentMember?.creditScore ?? 500) >= 500 ? 'var(--warning)' : 'var(--negative)',
              }}>
                {currentMember?.creditScore ?? 500}
              </span>
            </div>
            <CreditScoreLineChart data={creditChartData} />
          </div>
        )}

        {/* Salary captured vs max */}
        {has('analytics') && mandatoryChartData.length > 0 && (
          <div className="p-4 rounded-xl flex flex-col gap-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SALARY CAPTURED VS MAX</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>How much of your possible salary you earned each period</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#6ee7b7' }} />Earned</span>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--bg-raised)', border: '1px solid var(--border)' }} />Left on table</span>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 2, background: 'var(--warning)' }} />% captured</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={mandatoryChartData} margin={{ top: 4, right: 24, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={40} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={32} />
                <Tooltip contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'JetBrains Mono', fontSize: '11px' }} labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                  formatter={(v, name) => name === 'pct' ? [`${v}%`, 'Captured'] : name === 'earned' ? [fmt(v), 'Earned'] : [fmt(v), 'Left on table']} />
                <Bar yAxisId="left" dataKey="earned" stackId="a" fill="#6ee7b7" radius={[0, 0, 3, 3]} />
                <Bar yAxisId="left" dataKey="uncaptured" stackId="a" fill="var(--bg-raised)" stroke="var(--border)" strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="pct" stroke="var(--warning)" strokeWidth={2} dot={{ fill: 'var(--warning)', r: 3, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Bonus chore performance */}
        {has('analytics') && bonusChartData.length > 0 && (
          <div className="p-4 rounded-xl flex flex-col gap-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>BONUS CHORE PERFORMANCE</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>Extra money you earned — and money left on the table</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#6ee7b7' }} />Earned</span>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--bg-raised)', border: '1px solid var(--border)' }} />Left on table</span>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 2, background: 'var(--warning)' }} />% captured</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={bonusChartData} margin={{ top: 4, right: 24, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={40} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={32} />
                <Tooltip contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'JetBrains Mono', fontSize: '11px' }} labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                  formatter={(v, name) => name === 'pct' ? [`${v}%`, 'Capture rate'] : name === 'earned' ? [fmt(v), 'Earned'] : [fmt(v), 'Left on table']} />
                <Bar yAxisId="left" dataKey="earned" stackId="a" fill="#6ee7b7" radius={[0, 0, 3, 3]} />
                <Bar yAxisId="left" dataKey="uncaptured" stackId="a" fill="var(--bg-raised)" stroke="var(--border)" strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="pct" stroke="var(--warning)" strokeWidth={2} dot={{ fill: 'var(--warning)', r: 3, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Income allocation */}
        {has('analytics') && allocationChartData.length > 0 && (
          <div className="p-4 rounded-xl flex flex-col gap-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>INCOME ALLOCATION</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>Where each payslip went — tax &amp; rent come first</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              {[{ color: '#f87171', label: 'Tax & rent' }, { color: '#60a5fa', label: 'Savings' }, { color: '#4ade80', label: 'Wallet' }, { color: '#D4A017', label: 'Philanthropy' }].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color }} />{label}
                </span>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={allocationChartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'JetBrains Mono', fontSize: '11px' }} labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                  formatter={(v, name) => [fmt(v), { obligations: 'Tax & rent', savings: 'Savings', wallet: 'Wallet', philanthropy: 'Philanthropy' }[name] ?? name]} />
                <Bar dataKey="obligations" stackId="s" fill="#f87171" radius={[0, 0, 3, 3]} />
                <Bar dataKey="savings"     stackId="s" fill="#60a5fa" />
                <Bar dataKey="philanthropy" stackId="s" fill="#D4A017" />
                <Bar dataKey="wallet"      stackId="s" fill="#4ade80" radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top rewards spent */}
        {has('analytics') && allTxns.length > 0 && (
          <div className="p-4 rounded-xl flex flex-col gap-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TOP REWARDS SPENT ON</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>Your biggest spending habits — is it worth it?</p>
            </div>
            <TopRewardsChart transactions={allTxns} fmt={fmt} />
          </div>
        )}

        {/* Quick actions */}
        <p className="text-xs font-mono px-1 mt-1" style={{ color: 'var(--text-muted)' }}>QUICK ACCESS</p>
        {[
          { label: 'Today\'s Chores', sub: 'Mark tasks done, earn bonuses', to: '/child/chores' },
          { label: 'Reward Store',   sub: 'Spend your wallet',            to: '/child/rewards' },
          { label: 'Ledger',          sub: `See this ${periodLabel}'s earnings`,  to: '/child/ledger' },
        ].map(({ label, sub, to }) => (
          <button key={to} onClick={() => navigate(to)}
            className="flex items-center justify-between px-4 py-3 rounded-xl w-full transition-all active:scale-95"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="text-left">
              <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{sub}</p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-dim)' }} />
          </button>
        ))}
      </div>

      {showDonate && (
        <DonateSheet
          philanthropy={philanthropy}
          memberId={currentMember.id}
          fmt={fmt}
          onClose={() => setShowDonate(false)}
        />
      )}

      {showSpending && (
        <SpendingSheet
          memberId={currentMember.id}
          fmt={fmt}
          onClose={() => setShowSpending(false)}
        />
      )}

      {showPrepay && accounts.loan && (
        <PrepaySheet
          loan={accounts.loan}
          spending={accounts.spending ?? 0}
          memberId={currentMember.id}
          fmt={fmt}
          onDone={refreshMember}
          onClose={() => setShowPrepay(false)}
        />
      )}

      {creditPopup && (
        <CreditScorePopup
          score={creditPopup.score}
          prevScore={creditPopup.prevScore}
          onDismiss={handleDismissCredit}
        />
      )}

      {showNetWorth && (
        <NetWorthSheet
          accounts={accounts}
          subGoals={subGoals}
          subGoalTotal={subGoalTotal}
          totalSavings={totalSavings}
          fmt={fmt}
          onClose={() => setShowNetWorth(false)}
        />
      )}

      {showCashOut && (
        <CashOutSheet
          spending={accounts.spending ?? 0}
          memberId={currentMember.id}
          fmt={fmt}
          onClose={() => setShowCashOut(false)}
        />
      )}
    </div>
  )
}
