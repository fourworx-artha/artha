import EmptyChartNote from './EmptyChartNote'

// SVG mini line chart — net worth over settled payslips
// data: [{ label: string, value: number }]
export default function NetWorthChart({ data = [] }) {
  if (data.length < 2) return <EmptyChartNote />

  const W = 300, H = 80, PAD_L = 4, PAD_R = 4, PAD_T = 8, PAD_B = 20

  const values  = data.map(d => d.value)
  const minVal  = Math.min(...values)
  const maxVal  = Math.max(...values)
  const range   = maxVal - minVal || 1
  const inner_w = W - PAD_L - PAD_R
  const inner_h = H - PAD_T - PAD_B

  const toX = i  => PAD_L + (i / (data.length - 1)) * inner_w
  const toY = v  => PAD_T + inner_h - ((v - minVal) / range) * inner_h

  const points  = data.map((d, i) => ({ x: toX(i), y: toY(d.value), ...d }))
  const linePts = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last    = points[points.length - 1]
  const first   = points[0]

  // Area fill path
  const areaD = [
    `M ${first.x.toFixed(1)} ${(H - PAD_B).toFixed(1)}`,
    ...points.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${last.x.toFixed(1)} ${(H - PAD_B).toFixed(1)}`,
    'Z'
  ].join(' ')

  const isPositiveTrend = last.value >= first.value
  const trendColor = isPositiveTrend ? 'var(--positive)' : 'var(--negative)'
  const gradId = `nwg-${Math.random().toString(36).slice(2, 7)}`

  const fmt = (n) => {
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(Math.round(n))
  }

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPositiveTrend ? '#4ade80' : '#f87171'} stopOpacity="0.18" />
            <stop offset="100%" stopColor={isPositiveTrend ? '#4ade80' : '#f87171'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Line */}
        <polyline
          points={linePts}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots at each point */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3 : 2}
            fill={trendColor} />
        ))}

        {/* First + last value labels */}
        <text x={first.x} y={H} textAnchor="middle"
          fontSize="7" fontFamily="monospace" fill="var(--text-dim)">{first.label}</text>
        <text x={last.x} y={H} textAnchor="middle"
          fontSize="7" fontFamily="monospace" fill="var(--text-dim)">{last.label}</text>

        {/* Last value label near dot */}
        <text x={last.x + 4} y={last.y - 4} textAnchor="start"
          fontSize="8" fontFamily="monospace" fill={trendColor}>{fmt(last.value)}</text>
      </svg>
    </div>
  )
}
