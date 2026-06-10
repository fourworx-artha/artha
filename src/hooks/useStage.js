import { useFamily } from '../context/FamilyContext'
import { STAGES } from '../utils/constants'
import { deriveStage, stageRank, stageHasFeature } from '../utils/stages'

/**
 * Derived stage + feature gating for one member (W6).
 * Stage = f(settled payslip count) + family.config.stageOverride — never stored.
 * Parents (and unknown members) resolve to economist: parent surfaces are gated
 * by their CHILDREN's stages (see useStages), not their own.
 *
 * `loading` is true until FamilyContext has loaded settled counts — gate
 * route redirects on it so a Saver child isn't bounced off /child/savings
 * during the first render.
 */
export function useStage(member) {
  const { family, settledCounts } = useFamily()
  const loading  = settledCounts === null
  const override = family?.config?.stageOverride ?? null
  const settledCount = settledCounts?.[member?.id] ?? 0
  const stage = member?.role === 'child'
    ? deriveStage(settledCount, override)
    : 'economist'
  return {
    stage,
    override,
    settledCount,
    loading,
    has: (feature) => stageHasFeature(stage, feature),
  }
}

/**
 * Family-level stage view for parent surfaces.
 * `stages` maps childId → stage; `maxStage` is the furthest child (parent
 * menus unlock when ANY child reaches a stage); `guidedActive` is true while
 * any child is still below economist and the family hasn't skipped.
 */
export function useStages() {
  const { family, children, settledCounts } = useFamily()
  const loading  = settledCounts === null
  const override = family?.config?.stageOverride ?? null
  const stages = {}
  for (const c of children) {
    stages[c.id] = deriveStage(settledCounts?.[c.id] ?? 0, override)
  }
  const ranks = children.map(c => stageRank(stages[c.id]))
  const maxStage = ranks.length ? STAGES[Math.max(...ranks)] : 'starter'
  const guidedActive = !override && children.some(c => stages[c.id] !== 'economist')
  return {
    stages,
    maxStage,
    override,
    guidedActive,
    loading,
    has: (feature) => stageHasFeature(maxStage, feature),
  }
}
