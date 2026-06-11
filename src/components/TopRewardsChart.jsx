import EmptyChartNote from './EmptyChartNote'

// Top 5 rewards by cumulative spend — horizontal bar list
export default function TopRewardsChart({ transactions = [], fmt }) {
  const groups = {}
  transactions
    .filter(t => t.type === 'reward')
    .forEach(t => {
      const title = (t.description ?? '').replace(/^Reward:\s*/i, '').trim() || 'Reward'
      groups[title] = (groups[title] ?? 0) + Math.abs(t.amount)
    })

  const top5 = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (top5.length === 0) {
    return <EmptyChartNote text="No reward purchases yet" />
  }

  const max = top5[0][1]
  const total = top5.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="flex flex-col gap-3">
      {top5.map(([title, amount]) => (
        <div key={title} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-primary)', flex: 1, marginRight: 8 }}
              className="truncate">
              {title}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#c084fc', flexShrink: 0 }}>
              {fmt(amount)}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-raised)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(amount / max) * 100}%`,
              borderRadius: 3,
              background: 'linear-gradient(90deg, #a855f7, #c084fc)',
            }} />
          </div>
        </div>
      ))}
      {top5.length > 0 && (
        <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
          {fmt(total)} total on rewards shown
        </p>
      )}
    </div>
  )
}
