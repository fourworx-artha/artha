// ── Stage derivation + patch computation (W6) — pure functions only ──────────
// DB writes (applyStagePatches, migrateStageConfig) live in src/db/operations.js.
import { STAGES, STAGE_THRESHOLDS, STAGE_PATCHES, FEATURE_STAGES } from './constants'

/** Numeric rank of a stage. Unknown values rank as economist (fail open for legacy data). */
export function stageRank(stage) {
  const i = STAGES.indexOf(stage)
  return i === -1 ? STAGES.length - 1 : i
}

/**
 * Derive a child's stage from their settled payslip count.
 * family.config.stageOverride (set by "Skip the guided period") wins outright.
 */
export function deriveStage(settledCount, override = null) {
  if (override && STAGES.includes(override)) return override
  let stage = STAGES[0]
  for (const s of STAGES) {
    if ((settledCount ?? 0) >= STAGE_THRESHOLDS[s]) stage = s
  }
  return stage
}

/** True when `feature` is unlocked at `stage` (per FEATURE_STAGES; unlisted = always). */
export function stageHasFeature(stage, feature) {
  const required = FEATURE_STAGES[feature]
  if (!required) return true
  return stageRank(stage) >= stageRank(required)
}

/** All stage-patch keys unlocked at or below `stage` (e.g. saver → autoSavePercent, interestRate). */
export function unlockedStageKeys(stage) {
  const keys = []
  for (const s of STAGES) {
    if (stageRank(s) > stageRank(stage)) break
    keys.push(...Object.keys(STAGE_PATCHES[s] ?? {}))
  }
  return keys
}

/**
 * Cumulative config patch for a child advancing through `throughStage`.
 * Skips keys listed in config.configTouched (parent edits win over patches)
 * and keys already at the patch value. Returns {} when nothing to write.
 */
export function buildStagePatch(config, throughStage) {
  const touched = config?.configTouched ?? []
  const patch = {}
  for (const stage of STAGES) {
    if (stageRank(stage) > stageRank(throughStage)) break
    for (const [key, value] of Object.entries(STAGE_PATCHES[stage] ?? {})) {
      if (touched.includes(key)) continue
      if (config?.[key] !== value) patch[key] = value
    }
  }
  return patch
}
