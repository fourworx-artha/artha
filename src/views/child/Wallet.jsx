import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useFamily, useCurrency } from '../../context/FamilyContext'
import { addRewardRequest, getRewardRequests, parentDepositToSavings, addMemberRequest } from '../../db/operations'
import { REWARD_CATEGORIES } from '../../utils/constants'
import { getFamilyId } from '../../utils/family'
import { ChevronLeft, PiggyBank, Banknote, ShoppingBag } from 'lucide-react'

// ── Buy confirmation sheet ────────────────────────────────────────────────────
function BuySheet({ reward, spending, onConfirm, onClose }) {
  const fmt = useCurrency()
  const canAfford = spending >= reward.price
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{reward.emoji}</span>
            <div>
              <p className="text-lg font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{reward.title}</p>
              <p className="text-sm font-mono" style={{ color: 'var(--positive)' }}>{fmt(reward.price)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>YOUR WALLET</span>
            <span className="text-sm font-mono font-bold" style={{ color: canAfford ? 'var(--positive)' : 'var(--negative)' }}>
              {fmt(spending)}
            </span>
          </div>
          {!canAfford && (
            <p className="text-xs font-mono text-center" style={{ color: 'var(--negative)' }}>
              Need {fmt(reward.price - spending)} more to afford this
            </p>
          )}
          <p className="text-xs font-mono text-center" style={{ color: 'var(--text-muted)' }}>
            A parent must approve before it's redeemed
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-mono transition-all active:scale-95"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
            <button disabled={!canAfford} onClick={onConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{
                background: canAfford ? 'rgba(74,222,128,0.15)' : 'var(--bg-raised)',
                border: `1px solid ${canAfford ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                color: canAfford ? 'var(--positive)' : 'var(--text-dim)',
              }}>
              Request
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Transfer sheet ────────────────────────────────────────────────────────────
function TransferSheet({ type, spending, memberId, onDone, onClose, fmt }) {
  const [amount, setAmount] = useState('')
  const [note,   setNote]   = useState('')
  const [dest,   setDest]   = useState('cash')
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')

  const parsed = Math.min(Number(amount) || 0, spending)

  const handleSubmit = async () => {
    if (!parsed || parsed <= 0) { setError('Enter a valid amount'); return }
    setBusy(true); setError('')
    try {
      if (type === 'savings') {
        await parentDepositToSavings(memberId, parsed)
        onDone()
      } else if (type === 'cashout') {
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
        onDone()
      }
    } catch (e) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const config = {
    savings: { title: 'Move to Savings', color: '#60a5fa', emoji: '🏦' },
    cashout:  { title: 'Cash / Bank Out', color: 'var(--warning)', emoji: '💵' },
  }[type]

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="px-4 py-4 flex flex-col gap-4">
          <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {config.emoji} {config.title}
          </p>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>WALLET BALANCE</span>
            <span className="text-sm font-mono font-bold" style={{ color: 'var(--positive)' }}>{fmt(spending)}</span>
          </div>
          <input
            type="number" min={1} max={spending} placeholder="Amount"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          {type === 'cashout' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'cash', label: '💵 Physical cash' }, { id: 'bank', label: '🏦 Bank transfer' }].map(({ id, label }) => (
                  <button key={id} onClick={() => setDest(id)}
                    className="py-2 rounded-lg text-xs font-mono transition-all"
                    style={{
                      background: dest === id ? 'var(--accent-blue)' : 'var(--bg-raised)',
                      border: `1px solid ${dest === id ? 'var(--accent-blue)' : 'var(--border)'}`,
                      color: dest === id ? '#fff' : 'var(--text-muted)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </>
          )}
          {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-mono transition-all"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={busy || !parsed}
              className="flex-1 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
              style={{ background: config.color, color: '#fff', opacity: busy || !parsed ? 0.5 : 1 }}>
              {busy ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reward card ───────────────────────────────────────────────────────────────
function RewardCard({ reward, spending, pendingCount, onBuy }) {
  const fmt = useCurrency()
  const canAfford = spending >= reward.price
  return (
    <button onClick={() => onBuy(reward)}
      className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all active:scale-95 text-center relative"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: canAfford ? 1 : 0.5 }}>
      {pendingCount > 0 && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: 'var(--warning)', color: '#000',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700,
          borderRadius: 999, padding: '1px 6px', lineHeight: '16px',
        }}>
          {pendingCount}
        </span>
      )}
      <span className="text-4xl">{reward.emoji}</span>
      <p className="text-xs font-mono font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{reward.title}</p>
      <span className="text-xs font-mono font-bold" style={{ color: canAfford ? 'var(--positive)' : 'var(--text-dim)' }}>
        {fmt(reward.price)}
      </span>
    </button>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Wallet() {
  const navigate               = useNavigate()
  const { currentMember, refreshMember } = useAuth()
  const { rewards }            = useFamily()
  const fmt                    = useCurrency()

  const [requests,      setRequests]      = useState([])
  const [buying,        setBuying]        = useState(null)
  const [requesting,    setRequesting]    = useState(false)
  const [activeCategory, setCategory]    = useState('all')
  const [transferType,  setTransferType]  = useState(null) // 'savings' | 'cashout'

  const spending = currentMember?.accounts?.spending ?? 0
  const memberId = currentMember?.id

  const loadRequests = useCallback(async () => {
    if (!memberId) return
    setRequests(await getRewardRequests(memberId))
  }, [memberId])

  useEffect(() => { loadRequests() }, [loadRequests])

  const pendingCountMap = requests.reduce((acc, req) => {
    if (req.status === 'pending') acc[req.rewardId] = (acc[req.rewardId] ?? 0) + 1
    return acc
  }, {})

  const handleConfirm = async () => {
    if (!buying || requesting) return
    setRequesting(true)
    await addRewardRequest({ memberId, rewardId: buying.id, rewardTitle: buying.title, amount: buying.price })
    await loadRequests()
    setRequesting(false)
    setBuying(null)
  }

  const handleTransferDone = async () => {
    await refreshMember()
    setTransferType(null)
  }

  const categories = ['all', ...new Set(rewards.map(r => r.category))]
  const filtered   = rewards.filter(r => activeCategory === 'all' || r.category === activeCategory)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate('/child/home')}
          className="flex items-center gap-1 mb-2 -ml-1"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
          <ChevronLeft size={16} />
          <span className="text-xs font-mono">Home</span>
        </button>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>WALLET</p>
            <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              Spend &amp; Transfer
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>BALANCE</p>
            <p className="text-lg font-mono font-bold" style={{ color: 'var(--positive)' }}>{fmt(spending)}</p>
          </div>
        </div>
      </div>

      {/* Quick transfer row */}
      <div className="px-4 pt-3 pb-2 flex gap-2 shrink-0">
        <button onClick={() => setTransferType('savings')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa' }}>
          <PiggyBank size={13} /> Save
        </button>
        <button onClick={() => setTransferType('cashout')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--warning)' }}>
          <Banknote size={13} /> Cash Out
        </button>
      </div>

      {/* Divider */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            <ShoppingBag size={10} className="inline mr-1" />
            REWARD STORE
          </p>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 px-4 pb-2 shrink-0 overflow-x-auto">
        {categories.map(cat => {
          const meta = REWARD_CATEGORIES[cat]
          return (
            <button key={cat} onClick={() => setCategory(cat)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-all shrink-0"
              style={{
                background: activeCategory === cat ? 'var(--accent-blue)' : 'var(--bg-raised)',
                border: `1px solid ${activeCategory === cat ? 'var(--accent-blue)' : 'var(--border)'}`,
                color: activeCategory === cat ? '#fff' : 'var(--text-muted)',
              }}>
              {meta ? `${meta.emoji} ${meta.label}` : 'All'}
            </button>
          )
        })}
      </div>

      {/* Reward grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(reward => (
            <RewardCard
              key={reward.id}
              reward={reward}
              spending={spending}
              pendingCount={pendingCountMap[reward.id] ?? 0}
              onBuy={setBuying}
            />
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>
            No rewards in this category
          </p>
        )}
      </div>

      {/* Buy confirmation sheet */}
      {buying && (
        <BuySheet reward={buying} spending={spending} onConfirm={handleConfirm} onClose={() => setBuying(null)} />
      )}

      {/* Transfer sheet */}
      {transferType && (
        <TransferSheet
          type={transferType}
          spending={spending}
          memberId={memberId}
          fmt={fmt}
          onDone={handleTransferDone}
          onClose={() => setTransferType(null)}
        />
      )}
    </div>
  )
}
