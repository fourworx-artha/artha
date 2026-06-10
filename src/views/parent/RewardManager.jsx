import { useState, useCallback, useEffect } from 'react'
import { Plus, X, Check, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { useFamily } from '../../context/FamilyContext'
import { addReward, updateReward, getAllRewards } from '../../db/operations'
import { REWARD_CATEGORIES } from '../../utils/constants'
import { getFamilyId } from '../../utils/family'
import { useCurrency } from '../../context/FamilyContext'

// ── Reward form ───────────────────────────────────────────────────────────────
function RewardForm({ initial, onSave, onClose }) {
  const isEdit = !!initial

  // If the saved category is not a preset key, treat it as a custom string
  const isPreset = (cat) => cat && Object.keys(REWARD_CATEGORIES).includes(cat)
  const initCat  = initial?.category ?? 'treat'

  const [title,        setTitle]        = useState(initial?.title ?? '')
  const [price,        setPrice]        = useState(initial?.price ?? '')
  const [category,     setCategory]     = useState(isPreset(initCat) ? initCat : 'other')
  const [customCat,    setCustomCat]    = useState(isPreset(initCat) ? '' : initCat)
  const [emoji,        setEmoji]        = useState(initial?.emoji ?? '🎁')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const effectiveCategory = category === 'other' ? customCat.trim() : category

  const handleSave = async () => {
    if (!title.trim())  { setError('Title required'); return }
    if (!price || Number(price) <= 0) { setError('Price must be > 0'); return }
    if (category === 'other' && !customCat.trim()) { setError('Enter a category name'); return }
    setSaving(true)
    const data = {
      familyId: getFamilyId(),
      title: title.trim(),
      price: Number(price),
      category: effectiveCategory,
      emoji,
      isActive: initial?.isActive ?? true,
    }
    try {
      isEdit ? await updateReward(initial.id, data) : await addReward(data)
      onSave()
    } catch { setError('Save failed') }
    finally   { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit' : 'Add'} Reward
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Emoji + Title row */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 w-16">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>EMOJI</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)}
                className="w-full rounded-lg px-2 py-2 text-xl text-center outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
                maxLength={2}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>TITLE</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Ice Cream"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Price */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PRICE (₹)</label>
            <input type="number" min={1} value={price} onChange={e => setPrice(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>CATEGORY</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(REWARD_CATEGORIES).map(([key, { label, emoji: e }]) => (
                <button key={key} onClick={() => setCategory(key)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition-all"
                  style={{
                    background: category === key ? 'var(--accent-blue)' : 'var(--bg-raised)',
                    border: `1px solid ${category === key ? 'var(--accent-blue)' : 'var(--border)'}`,
                    color: category === key ? '#fff' : 'var(--text-muted)',
                  }}>
                  <span>{e}</span><span>{label}</span>
                </button>
              ))}
              <button onClick={() => setCategory('other')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition-all"
                style={{
                  background: category === 'other' ? 'var(--accent-blue)' : 'var(--bg-raised)',
                  border: `1px solid ${category === 'other' ? 'var(--accent-blue)' : 'var(--border)'}`,
                  color: category === 'other' ? '#fff' : 'var(--text-muted)',
                }}>
                <span>✏️</span><span>Other…</span>
              </button>
            </div>
            {category === 'other' && (
              <input
                autoFocus
                value={customCat}
                onChange={e => setCustomCat(e.target.value)}
                placeholder="e.g. Outdoor, Books, Music…"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--accent-blue)', color: 'var(--text-primary)' }}
              />
            )}
          </div>

          {error && <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{ background: saving ? 'var(--border)' : 'var(--accent-blue)', color: '#fff' }}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Reward'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reward row ────────────────────────────────────────────────────────────────
function RewardRow({ reward, onEdit, onToggle }) {
  const fmt = useCurrency()
  const meta = REWARD_CATEGORIES[reward.category]
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: reward.isActive ? 1 : 0.45 }}>
      <span className="text-2xl shrink-0">{reward.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{reward.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-mono" style={{ color: 'var(--positive)' }}>{fmt(reward.price)}</span>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {meta?.label ?? reward.category}
          </span>
        </div>
      </div>
      <button onClick={onEdit} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--bg-raised)' }}>
        <Pencil size={14} />
      </button>
      <button onClick={onToggle} style={{ color: reward.isActive ? 'var(--positive)' : 'var(--text-dim)' }}>
        {reward.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RewardManager() {
  const { rewards: activeRewards, reload } = useFamily()
  const [form, setForm] = useState(null)

  // We need all rewards including inactive — use getAllRewards
  const [allRewards, setAllRewards] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  // Load all rewards (including inactive) once
  const loadAll = useCallback(async () => {
    const all = await getAllRewards(getFamilyId())
    all.sort((a, b) => a.price - b.price)
    setAllRewards(all)
  }, [])

  // Use allRewards if loaded, otherwise fall back to activeRewards
  const displayed = (allRewards ?? activeRewards).filter(r => showInactive || r.isActive)

  const handleSave = async () => {
    await reload()
    await loadAll()
    setForm(null)
  }

  const handleToggle = async (reward) => {
    await updateReward(reward.id, { isActive: !reward.isActive })
    await reload()
    await loadAll()
  }

  // Load all on mount
  useEffect(() => { loadAll() }, [loadAll])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
        <div className="flex items-center justify-between mt-0.5">
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Reward Manager
          </h2>
          <button onClick={() => setShowInactive(s => !s)}
            className="text-xs font-mono px-2 py-1 rounded-lg"
            style={{
              background: showInactive ? 'var(--bg-raised)' : 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}>
            {showInactive ? 'Hide inactive' : 'Show all'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {displayed.length === 0 && (
          <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>
            No rewards yet
          </p>
        )}
        {displayed.map(r => (
          <RewardRow key={r.id} reward={r}
            onEdit={() => setForm(r)}
            onToggle={() => handleToggle(r)}
          />
        ))}
      </div>

      <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setForm({})}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <Plus size={16} /> Add Reward
        </button>
      </div>

      {form !== null && (
        <RewardForm
          initial={form.id ? form : null}
          onSave={handleSave}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
