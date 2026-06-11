import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAlerts, alertRoute } from '../hooks/useAlerts'

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Bell icon + unread badge + alert feed bottom sheet (W7).
 * Lives in the Dashboard and child Home headers. Tapping an alert marks it
 * read and navigates via its type/data; "Mark all read" clears the badge.
 */
export default function AlertBell() {
  const { currentMember } = useAuth()
  const { alerts, unreadCount, markRead, markAllRead } = useAlerts()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (!currentMember) return null

  const handleTap = (alert) => {
    setOpen(false)
    markRead(alert.id)
    navigate(alertRoute(alert, currentMember.role))
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-1.5 rounded-lg transition-all active:scale-95"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        title="Alerts">
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute flex items-center justify-center rounded-full font-mono"
            style={{
              top: -4, right: -4, minWidth: 15, height: 15, padding: '0 3px',
              fontSize: 9, fontWeight: 700, background: 'var(--accent-blue)', color: '#fff',
            }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="rounded-t-2xl flex flex-col max-h-[80vh]"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
            </div>
            <div className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                🔔 Alerts
              </span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead}
                    className="text-xs font-mono"
                    style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer' }}>
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {alerts.length === 0 && (
                <p className="text-xs font-mono text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  No alerts yet
                </p>
              )}
              {alerts.map(alert => {
                const unread = !alert.readAt
                return (
                  <button key={alert.id} onClick={() => handleTap(alert)}
                    className="flex items-start gap-2 w-full px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]"
                    style={{
                      background: unread ? 'var(--bg-raised)' : 'transparent',
                      border: `1px solid ${unread ? 'var(--border-bright)' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}>
                    <div className="shrink-0 rounded-full"
                      style={{
                        width: 6, height: 6, marginTop: 5,
                        background: unread ? 'var(--accent-blue)' : 'transparent',
                      }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono"
                        style={{ color: 'var(--text-primary)', fontWeight: unread ? 700 : 400 }}>
                        {alert.title}
                      </p>
                      {alert.body && (
                        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {alert.body}
                        </p>
                      )}
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                        {timeAgo(alert.createdAt)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="px-4 pb-6 pt-2 shrink-0">
              <button onClick={() => setOpen(false)}
                className="w-full py-3 rounded-xl text-sm font-mono font-semibold"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
