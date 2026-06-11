import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FamilyProvider, useFamily } from './context/FamilyContext'
import { getPendingLogsForMembers, getPendingMemberRequests, getPendingRewardRequests, getDeviceClaim, getOrCreateDeviceId, checkFamilyExists, getLatestPayslip } from './db/operations'
import { supabase } from './db/supabase'
import { getFamilyId, setFamilyId } from './utils/family'
import ParentNav from './components/ParentNav'
import ChildNav from './components/ChildNav'
import InstallPrompt from './components/InstallPrompt'
import JoinFamily from './views/auth/JoinFamily'
import OnboardingFlow from './views/onboarding/OnboardingFlow'

// Auth
import PinAuth from './auth/PinAuth'

// Parent views
import ParentDashboard  from './views/parent/Dashboard'
import ChoreManager     from './views/parent/ChoreManager'
import ApproveChores    from './views/parent/ApproveChores'
import UtilityLogger    from './views/parent/UtilityLogger'
import EconomicControls from './views/parent/EconomicControls'
import RewardManager    from './views/parent/RewardManager'
import TaxFund          from './views/parent/TaxFund'
import More             from './views/parent/More'
import Backup           from './views/parent/Backup'
import Members          from './views/parent/Members'
import Loans            from './views/parent/Loans'
import ChildDetail      from './views/parent/ChildDetail'
import InviteCode       from './views/parent/InviteCode'
import Expenses         from './views/parent/Expenses'
import Vacation        from './views/parent/Vacation'

// Child views
import ChildHome  from './views/child/Home'
import Chores     from './views/child/Chores'
import Ledger     from './views/child/Ledger'
import Savings    from './views/child/Savings'
import GoalJar    from './views/child/GoalJar'
import FamilyFund from './views/child/FamilyFund'
import Rewards    from './views/child/Rewards'
import Wallet     from './views/child/Wallet'
import History    from './views/child/History'


import { DeviceContext } from './context/DeviceContext'
import { useStage, useStages } from './hooks/useStage'
export { useDevice } from './context/DeviceContext'

// ── Stage route guards (W6) ───────────────────────────────────────────────────
// Gated screens redirect home when accessed directly below the unlocking stage.
// Renders nothing while settled counts load so unlocked children aren't bounced.
function ChildStageRoute({ feature, children }) {
  const { currentMember } = useAuth()
  const { has, loading } = useStage(currentMember)
  if (currentMember?.role === 'child') {
    if (loading) return null
    if (!has(feature)) return <Navigate to="/child/home" replace />
  }
  return children
}

// Parent screens unlock when ANY child has reached the feature's stage.
function ParentStageRoute({ feature, children }) {
  const { has, loading } = useStages()
  if (loading) return null
  if (!has(feature)) return <Navigate to="/parent" replace />
  return children
}

// ── Device gate ───────────────────────────────────────────────────────────────
// localStorage key for persisting the claim so it's synchronous on return visits
const CLAIM_KEY = 'artha_device_claim'

function readCachedClaim() {
  try {
    const raw = localStorage.getItem(CLAIM_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeCachedClaim(claim) {
  try { localStorage.setItem(CLAIM_KEY, JSON.stringify(claim)) } catch {}
}

function saveClaim(setClaim) {
  return (claim) => {
    writeCachedClaim(claim)
    setClaim(claim)
  }
}

// Runs before any routing. Routes to:
//   'onboarding' → no family exists yet (brand new install)
//   'join'       → family exists but this device is unclaimed
//   'ready'      → device is claimed, proceed to app
function DeviceGate({ children }) {
  const cached = readCachedClaim()
  // Self-migrate: backfill artha_family_id from cached claim so getFamilyId() works
  // on devices that claimed before W4 shipped (no localStorage entry yet).
  if (!localStorage.getItem('artha_family_id') && cached?.familyId) {
    setFamilyId(cached.familyId)
  }
  const [screen, setScreen] = useState(cached ? 'ready' : 'checking')
  const [claim,  setClaim]  = useState(cached)

  useEffect(() => {
    if (cached) return // already ready, skip async check
    Promise.all([getDeviceClaim(), checkFamilyExists()])
      .then(([c, familyExists]) => {
        if (c) {
          writeCachedClaim(c)
          setClaim(c)
          setScreen('ready')
        } else if (!familyExists) {
          setScreen('onboarding')
        } else {
          setScreen('join')
        }
      })
      .catch(() => setScreen('join'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClaimed = (c) => {
    writeCachedClaim(c)
    setClaim(c)
    setScreen('ready')
  }

  if (screen === 'checking') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>
        Loading...
      </span>
    </div>
  )

  if (screen === 'onboarding') return (
    <OnboardingFlow
      onComplete={handleClaimed}
      onJoinInstead={() => setScreen('join')}
    />
  )

  if (screen === 'join') return (
    <JoinFamily
      onClaimed={handleClaimed}
      onSkip={async () => {
        const fid = getFamilyId()
        if (!fid) return
        const deviceId = getOrCreateDeviceId()
        await supabase.from('device_claims').upsert({
          device_id: deviceId, family_id: fid,
          member_id: null, claimed_at: new Date().toISOString(),
        })
        handleClaimed({ deviceId, familyId: fid, memberId: null })
      }}
    />
  )

  return (
    <DeviceContext.Provider value={claim}>
      {children}
    </DeviceContext.Provider>
  )
}

// ── Placeholder ───────────────────────────────────────────────────────────────
function ComingSoon({ label }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
        {label} — coming soon
      </p>
    </div>
  )
}

// ── Parent shell ──────────────────────────────────────────────────────────────
function ParentShell() {
  const { currentMember } = useAuth()
  const { children, reloadCount } = useFamily()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!children.length) return
    const ids = children.map(c => c.id)
    Promise.all([
      getPendingLogsForMembers(ids),
      getPendingMemberRequests(ids),
      getPendingRewardRequests(ids),
    ]).then(([logs, memberReqs, rewardReqs]) =>
      setPendingCount(logs.length + memberReqs.length + rewardReqs.length)
    )
  }, [children, reloadCount])

  if (!currentMember || currentMember.role !== 'parent') return <Navigate to="/" replace />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <ParentNav pendingCount={pendingCount} />
    </div>
  )
}

// ── Child shell ───────────────────────────────────────────────────────────────
function ChildShell() {
  const { currentMember, refreshMember } = useAuth()
  const { reloadCount } = useFamily()
  const [hasDraftPayslip, setHasDraftPayslip] = useState(false)

  const checkDraft = useCallback(async () => {
    if (!currentMember) return
    const ps = await getLatestPayslip(currentMember.id).catch(() => null)
    setHasDraftPayslip(ps?.status === 'draft')
  }, [currentMember?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh member data on every realtime tick. (The old reward-approval toast
  // lived here — absorbed by the W7 reward_approved banner on Home.)
  useEffect(() => {
    if (!currentMember) return
    refreshMember()
    checkDraft()
  }, [reloadCount]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentMember || currentMember.role !== 'child') {
    return <Navigate to="/" replace />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <ChildNav hasDraftPayslip={hasDraftPayslip} />
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <FamilyProvider>
        <DeviceGate>
        <AuthProvider>
          <InstallPrompt />
        <Routes>
            <Route path="/" element={<PinAuth />} />

            {/* Parent routes */}
            <Route path="/parent" element={<ParentShell />}>
              <Route index           element={<ParentDashboard />} />
              <Route path="chores"   element={<ChoreManager />} />
              <Route path="approve"  element={<ApproveChores />} />
              <Route path="more"     element={<More />} />
              <Route path="utilities" element={<ParentStageRoute feature="utilities"><UtilityLogger /></ParentStageRoute>} />
              <Route path="economy"  element={<EconomicControls />} />
              <Route path="rewards"  element={<RewardManager />} />
              <Route path="tax-fund" element={<ParentStageRoute feature="familyFund"><TaxFund /></ParentStageRoute>} />
              <Route path="backup"   element={<Backup />} />
              <Route path="members"     element={<Members />} />
              <Route path="loans"       element={<ParentStageRoute feature="loans"><Loans /></ParentStageRoute>} />
              <Route path="invite-code" element={<InviteCode />} />
              <Route path="child/:memberId" element={<ChildDetail />} />
              <Route path="expenses"        element={<Expenses />} />
              <Route path="vacation"       element={<ParentStageRoute feature="vacation"><Vacation /></ParentStageRoute>} />
            </Route>

            {/* Child routes */}
            <Route path="/child" element={<ChildShell />}>
              <Route path="home"    element={<ChildHome />} />
              <Route path="chores"  element={<Chores />} />
              <Route path="ledger"  element={<Ledger />} />
              <Route path="payslip" element={<Navigate to="/child/ledger" replace />} />
              <Route path="savings" element={<ChildStageRoute feature="savings"><Savings /></ChildStageRoute>} />
              <Route path="goal"        element={<ChildStageRoute feature="subGoals"><GoalJar /></ChildStageRoute>} />
              <Route path="family-fund" element={<ChildStageRoute feature="familyFund"><FamilyFund /></ChildStageRoute>} />
              <Route path="rewards" element={<Rewards />} />
              <Route path="wallet"  element={<Wallet />} />
              <Route path="history" element={<Navigate to="/child/ledger" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
        </DeviceGate>
      </FamilyProvider>
    </BrowserRouter>
  )
}
