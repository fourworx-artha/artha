/**
 * Friendly placeholder for charts that don't have enough history yet (W8).
 * Charts must never render broken axes with 0–1 settled payslips — this is
 * what shows instead, the day a stage (or "Skip the guided period") unlocks
 * a chart surface before the data exists.
 */
export default function EmptyChartNote({ text = 'Charts appear after a couple of paydays' }) {
  return (
    <div className="flex items-center justify-center py-6">
      <p style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'monospace' }}>
        {text}
      </p>
    </div>
  )
}
