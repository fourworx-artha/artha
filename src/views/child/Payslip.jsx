import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFamily } from '../../context/FamilyContext'
import { getPayslips } from '../../db/operations'
import PayslipCard from '../../components/PayslipCard'
import { displayDate } from '../../utils/dates'
import { useCurrency, usePeriod } from '../../context/FamilyContext'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function Payslip() {
  const { currentMember } = useAuth()
  const { family, reloadCount } = useFamily()
  const fmt = useCurrency()
  const { label: periodLabel } = usePeriod()
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null) // payslip id shown in full

  useEffect(() => {
    if (!currentMember) return
    getPayslips(currentMember.id).then(p => {
      const sorted = [...p].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
      setPayslips(sorted)
      setLoading(false)
    })
  }, [currentMember, reloadCount])

  const latest   = payslips[0]
  const archived = payslips.slice(1)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!latest) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PAYSLIP</p>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-8 text-center">
          <span className="text-5xl">📋</span>
          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
            No payslip yet
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            Your first payslip will appear here after payday (Saturday)
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PAYSLIP</p>
        <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          {periodLabel === 'month' ? 'Month' : 'Week'} ending {displayDate(latest.periodEnd)}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Draft badge */}
        {latest.status === 'draft' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--warning)' }}>
              ⏳ Pending settlement — your parent hasn't released this payment yet
            </span>
          </div>
        )}

        {/* Latest payslip */}
        <PayslipCard
          payslip={latest}
          member={currentMember}
          familyName={family?.name}
        />

        {/* Archive */}
        {archived.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>
              ARCHIVE ({archived.length})
            </p>
            {archived.map(p => (
              <div key={p.id}>
                {/* Collapsed row */}
                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: 'var(--bg-surface)',
                    border: `1px solid ${expanded === p.id ? 'var(--border-bright)' : 'var(--border)'}`,
                  }}>
                  <div className="text-left">
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {displayDate(p.periodStart)} – {displayDate(p.periodEnd)}
                    </p>
                    <p className="text-sm font-mono font-bold mt-0.5" style={{ color: 'var(--positive)' }}>
                      {fmt(p.net)} net
                    </p>
                  </div>
                  {expanded === p.id
                    ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                  }
                </button>

                {/* Expanded */}
                {expanded === p.id && (
                  <div className="mt-2">
                    <PayslipCard payslip={p} member={currentMember} familyName={family?.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
