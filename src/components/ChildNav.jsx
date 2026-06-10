import { NavLink, useNavigate } from 'react-router-dom'
import { Home, CheckSquare, FileText, Heart, Gift, PiggyBank, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useStage } from '../hooks/useStage'

export default function ChildNav({ hasDraftPayslip }) {
  const { logout, currentMember } = useAuth()
  const { has } = useStage(currentMember)
  const navigate   = useNavigate()

  // Starter: Home, Chores, Ledger, Rewards. Savings appears at Saver,
  // Goals (sub-goals) at Investor — the nav itself teaches the progression.
  const items = [
    { to: '/child/home',    label: 'Home',    Icon: Home,        end: true },
    { to: '/child/chores',  label: 'Chores',  Icon: CheckSquare },
    { to: '/child/ledger',  label: 'Ledger',  Icon: FileText,    badgeKey: 'ledger' },
    ...(has('savings')  ? [{ to: '/child/savings', label: 'Savings', Icon: PiggyBank }] : []),
    ...(has('subGoals') ? [{ to: '/child/goal',    label: 'Goals',   Icon: Heart }]     : []),
    { to: '/child/rewards', label: 'Rewards', Icon: Gift },
  ]

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <nav
      className="flex shrink-0"
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-surface)',
      }}
    >
      {items.map(({ to, label, Icon, end, badgeKey }) => {
        const showDot = badgeKey === 'ledger' && hasDraftPayslip
        return (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-1"
          style={({ isActive }) => ({
            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
          })}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <Icon size={20} />
            {showDot && (
              <span style={{
                position: 'absolute', top: -3, right: -5,
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--warning)', border: '1.5px solid var(--bg-surface)',
              }} />
            )}
          </div>
          <span className="text-xs font-mono">{label}</span>
        </NavLink>
        )
      })}
      <button
        onClick={handleLogout}
        className="flex-1 flex flex-col items-center justify-center py-2 gap-1"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
      >
        <LogOut size={20} />
        <span className="text-xs font-mono">Exit</span>
      </button>
    </nav>
  )
}
