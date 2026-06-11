import EmptyChartNote from './EmptyChartNote'

// SVG two-line chart: actual savings history (solid) + projected growth (dashed)
// actualData: [{ label, value }]   — settled payslips
// projected:  [{ label, value }]   — future periods
export default function SavingsGrowthChart({ actualData = [], projected = [] }) {
  // With 0–1 settled payslips a projection from a (near-)zero balance is just a
  // flat line — show the friendly note until real history exists (W8).
  if (actualData.length < 2) return <EmptyChartNote />
  const allData = [...actualData, ...projected]

  const W = 300, H = 90, PAD_L = 4, PAD_R = 36, PAD_T = 10, PAD_B = 18
  const inner_w = W - PAD_L - PAD_R
  const inner_h = H - PAD_T - PAD_B

  const values  = allData.map(d => d.value)
  const minVal  = 0  // always start from 0 for savings
  const maxVal  = Math.max(...values) || 1

  const toX = i  => PAD_L + (i / (allData.length - 1)) * inner_w
  const toY = v  => PAD_T + inner_h - ((v - minVal) / (maxVal - minVal)) * inner_h

  // Points for actual line (solid)
  const actualPts = actualData.map((d, i) => ({
    x: toX(i), y: toY(d.value), ...d
  }))

  // Points for projected line (dashed) — starts where actual ends
  const projOffset = actualData.length - 1
  const projPts = projected.map((d, i) => ({
    x: toX(projOffset + i + 1), y: toY(d.value), ...d
  }))

  // Connect: last actual point + all projected
  const connPts = actualPts.length > 0
    ? [actualPts[actualPts.length - 1], ...projPts]
    : projPts

  const toPolyline = pts => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const fmt = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(Math.round(n))
  }

  const lastProj = projPts[projPts.length - 1]

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        {/* Zero line */}
        <line x1={PAD_L} y1={PAD_T + inner_h} x2={W - PAD_R} y2={PAD_T + inner_h}
          stroke="var(--border)" strokeWidth="1" />

        {/* Divider between actual / projected */}
        {actualPts.length > 0 && projPts.length > 0 && (
          <line
            x1={actualPts[actualPts.length - 1].x}
            y1={PAD_T}
            x2={actualPts[actualPts.length - 1].x}
            y2={PAD_T + inner_h}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}

        {/* Actual line — solid blue */}
        {actualPts.length >= 2 && (
          <polyline
            points={toPolyline(actualPts)}
            fill="none"
            stroke="var(--accent-blue)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Projected line — dashed, dimmer */}
        {connPts.length >= 2 && (
          <polyline
            points={toPolyline(connPts)}
            fill="none"
            stroke="var(--accent-blue)"
            strokeWidth="1.5"
            strokeDasharray="4,3"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.45"
          />
        )}

        {/* Dots on actual */}
        {actualPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill="var(--accent-blue)" />
        ))}

        {/* End dot on projection */}
        {lastProj && (
          <circle cx={lastProj.x} cy={lastProj.y} r={2.5}
            fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" opacity="0.55" />
        )}

        {/* Projected end value */}
        {lastProj && (
          <text x={lastProj.x + 4} y={lastProj.y - 3} textAnchor="start"
            fontSize="8" fontFamily="monospace" fill="var(--accent-blue)" opacity="0.7">
            {fmt(lastProj.value)}
          </text>
        )}

        {/* "NOW" label at divider */}
        {actualPts.length > 0 && projPts.length > 0 && (
          <text x={actualPts[actualPts.length - 1].x} y={H - 2} textAnchor="middle"
            fontSize="7" fontFamily="monospace" fill="var(--text-dim)">NOW</text>
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 justify-center mt-1">
        <div className="flex items-center gap-1">
          <svg width="16" height="4" viewBox="0 0 16 4">
            <line x1="0" y1="2" x2="16" y2="2" stroke="var(--accent-blue)" strokeWidth="2" />
          </svg>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)' }}>ACTUAL</span>
        </div>
        <div className="flex items-center gap-1">
          <svg width="16" height="4" viewBox="0 0 16 4">
            <line x1="0" y1="2" x2="16" y2="2" stroke="var(--accent-blue)" strokeWidth="2"
              strokeDasharray="4,3" opacity="0.5" />
          </svg>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)' }}>PROJECTED</span>
        </div>
      </div>
    </div>
  )
}
