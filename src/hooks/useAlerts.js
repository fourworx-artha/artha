import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { getAlerts, markAlertRead, markAllAlertsRead, dismissAlert } from '../db/operations'

/** Route an alert tap to the screen its type/data points at. */
export function alertRoute(alert, role) {
  if (role === 'parent') {
    switch (alert.type) {
      case 'approvals_pending': return '/parent/approve'
      default:                  return '/parent'
    }
  }
  switch (alert.type) {
    case 'payslip_settled':
    case 'first_payslip':   return '/child/ledger'
    case 'chores_due':
    case 'chores_all_done':
    case 'chore_approved':
    case 'chore_rejected':  return '/child/chores'
    case 'reward_approved':
    case 'reward_rejected': return '/child/rewards'
    case 'cash_approved':   return '/child/wallet'
    default:                return '/child/home'
  }
}

/**
 * Alert feed for the logged-in member (W7). Refreshes on every realtime tick
 * (the alerts table is on FamilyContext's family-sync channel). Mutations
 * update local state optimistically so the badge reacts instantly.
 */
export function useAlerts() {
  const { currentMember } = useAuth()
  const { reloadCount } = useFamily()
  const [alerts, setAlerts] = useState([])

  const refresh = useCallback(async () => {
    if (!currentMember) return
    try {
      setAlerts(await getAlerts({ role: currentMember.role, memberId: currentMember.id }))
    } catch (e) {
      console.warn('[Artha] alerts load failed:', e)
    }
  }, [currentMember?.id, currentMember?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh() }, [refresh, reloadCount])

  const markRead = useCallback((id) => {
    const now = new Date().toISOString()
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, readAt: a.readAt ?? now } : a))
    markAlertRead(id).catch(() => {})
  }, [])

  const markAllRead = useCallback(() => {
    const unread = alerts.filter(a => !a.readAt).map(a => a.id)
    if (!unread.length) return
    const now = new Date().toISOString()
    setAlerts(prev => prev.map(a => a.readAt ? a : { ...a, readAt: now }))
    markAllAlertsRead(unread).catch(() => {})
  }, [alerts])

  const dismiss = useCallback((id) => {
    const now = new Date().toISOString()
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissedAt: now, readAt: a.readAt ?? now } : a))
    dismissAlert(id).catch(() => {})
  }, [])

  return {
    alerts,
    banners:     alerts.filter(a => (a.channels ?? []).includes('banner') && !a.dismissedAt),
    unreadCount: alerts.filter(a => !a.readAt).length,
    refresh, markRead, markAllRead, dismiss,
  }
}
