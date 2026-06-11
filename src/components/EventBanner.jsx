import { useState } from 'react'
import { X } from 'lucide-react'
import { today } from '../utils/dates'

// Banner priority: payslip > stage > chores/approvals (blueprint W7).
const PRIORITY = {
  payslip_overdue: 0, payslip_ready: 0, payslip_settled: 0, first_payslip: 0,
  stage_unlocked: 1,
}
const prio = (type) => PRIORITY[type] ?? 2

const dismissKey = (key) => `artha_banner_dismissed:${key}:${today()}`

/**
 * Stacked dismissible event banners (W7) — top of Dashboard / child Home.
 * `banners` are alert rows (dismiss writes dismissed_at via onDismiss);
 * `computed` are derived-on-load items ({ key, type, title, body?, onTap })
 * with no table row — their dismissal is local to the device for the day.
 * Max 2 visible. Titles carry their own emoji icon.
 */
export default function EventBanner({ banners = [], computed = [], onDismiss, onTap }) {
  const [, bump] = useState(0) // re-render after a local (computed) dismissal

  const items = [
    ...banners.map(a => ({
      key:       a.id,
      type:      a.type,
      title:     a.title,
      body:      a.body,
      createdAt: a.createdAt ?? '',
      onTap:     onTap ? () => onTap(a) : null,
      dismiss:   () => onDismiss?.(a),
    })),
    ...computed
      .filter(c => !localStorage.getItem(dismissKey(c.key)))
      .map(c => ({
        key:       c.key,
        type:      c.type ?? c.key,
        title:     c.title,
        body:      c.body,
        createdAt: '', // sorts after alert rows of the same priority
        onTap:     c.onTap ?? null,
        dismiss:   () => {
          try { localStorage.setItem(dismissKey(c.key), '1') } catch { /* private mode */ }
          bump(n => n + 1)
        },
      })),
  ]
    .sort((a, b) => prio(a.type) - prio(b.type) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 2)

  if (!items.length) return null

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => {
        // W9: stage_unlocked banners get a distinct celebratory (gold) treatment.
        const celebration = item.type === 'stage_unlocked'
        return (
        <div key={item.key} className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
          style={celebration
            ? {
                background: 'linear-gradient(135deg, rgba(251,191,36,0.14), rgba(251,191,36,0.04)), var(--bg-surface)',
                border: '1px solid rgba(251,191,36,0.45)',
                boxShadow: '0 0 16px rgba(251,191,36,0.10)',
              }
            : { background: 'var(--bg-surface)', border: '1px solid var(--border-bright)' }}>
          <button
            onClick={item.onTap ?? undefined}
            disabled={!item.onTap}
            className="flex-1 min-w-0 text-left"
            style={{ background: 'none', border: 'none', padding: 0, cursor: item.onTap ? 'pointer' : 'default' }}>
            <p className="text-xs font-mono font-semibold"
              style={{ color: celebration ? 'var(--warning)' : 'var(--text-primary)' }}>
              {item.title}
            </p>
            {item.body && (
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {item.body}
              </p>
            )}
          </button>
          <button onClick={item.dismiss} aria-label="Dismiss"
            className="shrink-0 p-0.5"
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        )
      })}
    </div>
  )
}
