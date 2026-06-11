import EmptyChartNote from './EmptyChartNote'

// SVG donut chart — "where does money go" breakdown by transaction type
// data: [{ label, value, color }]

function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180)   // -90 so 0° starts at top
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function slicePath(cx, cy, r, startDeg, endDeg) {
  const start = polarToXY(cx, cy, r, startDeg)
  const end   = polarToXY(cx, cy, r, endDeg)
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`
}

export default function SpendingBreakdown({ transactions = [] }) {
  const cats = {
    tax:           { label: 'Tax',           color: '#fb923c', value: 0 },
    rent:          { label: 'Rent',          color: '#f87171', value: 0 },
    utility:       { label: 'Utilities',     color: '#f97316', value: 0 },
    savings:       { label: 'Savings',       color: '#60a5fa', value: 0 },
    goals:         { label: 'Goals',         color: '#818cf8', value: 0 },
    philanthropy:  { label: 'Philanthropy',  color: '#D4A017', value: 0 },
    loan_repay:    { label: 'Loan principal',color: '#fbbf24', value: 0 },
    loan_interest: { label: 'Loan interest', color: '#d97706', value: 0 },
    reward:        { label: 'Rewards',       color: '#c084fc', value: 0 },
  }

  transactions.forEach(tx => {
    const type = tx.type
    const amt  = Math.abs(tx.amount)
    const desc = tx.description?.toLowerCase() ?? ''

    switch (type) {
      case 'tax':
        cats.tax.value += amt; break
      case 'rent':
        cats.rent.value += amt; break
      case 'utility':
        cats.utility.value += amt; break
      case 'loan_repay':
      case 'loan_cleared':
        cats.loan_repay.value += amt; break
      case 'loan_interest':
        cats.loan_interest.value += amt; break
      case 'reward':
        cats.reward.value += amt; break
      case 'deposit':
        if (desc.includes('philanthropy'))       cats.philanthropy.value += amt
        else if (desc.includes('goal deposit'))  cats.goals.value += amt
        else if (desc.includes('savings'))       cats.savings.value += amt
        break
      // salary, bonus, interest, loan_credit, parent_bonus, withdrawal = income / not outflows
      default: break
    }
  })

  const items = Object.values(cats).filter(c => c.value > 0)
  const total = items.reduce((s, c) => s + c.value, 0)

  if (items.length === 0 || total === 0) {
    return <EmptyChartNote text="No spending yet — the breakdown appears once money moves" />
  }

  const SIZE = 120, cx = SIZE / 2, cy = SIZE / 2, r = SIZE * 0.38, innerR = SIZE * 0.22

  let currentAngle = 0
  const slices = items.map(item => {
    const deg   = (item.value / total) * 360
    const start = currentAngle
    const end   = currentAngle + deg
    currentAngle = end
    return { ...item, start, end }
  })

  return (
    <div className="flex items-center gap-4">
      {/* Donut */}
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i}
            d={slicePath(cx, cy, r, s.start, s.end - 0.5)}
            fill={s.color}
            opacity="0.85"
          />
        ))}
        {/* Inner cutout */}
        <circle cx={cx} cy={cy} r={innerR} fill="var(--bg-surface)" />
        {/* Total label */}
        <text x={cx} y={cy - 3} textAnchor="middle"
          fontSize="7" fontFamily="monospace" fill="var(--text-muted)">TOTAL</text>
        <text x={cx} y={cy + 8} textAnchor="middle"
          fontSize="9" fontFamily="monospace" fontWeight="bold" fill="var(--text-primary)">
          {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : Math.round(total)}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', flex: 1 }}>
              {s.label}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
