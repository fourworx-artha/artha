import { useState } from 'react'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { createFamily, addMember, addChore } from '../../db/operations'
import { hashPin } from '../../auth/pinUtils'
import { CURRENCIES } from '../../utils/constants'
import PayslipCard from '../../components/PayslipCard'
import InviteCodePanel from '../../components/InviteCodePanel'

// ── Constants ─────────────────────────────────────────────────────────────────

const PARENT_AVATARS = ['👨','👩','👴','👵','🧑','👨‍💼','👩‍💼','👨‍🦱','👩‍🦱','👨‍🦳','👩‍🦳','🧔','👱','👱‍♀️','🙎','🙎‍♀️']
const CHILD_AVATARS  = ['👦','👧','🧒','👶','🧑','😊','😎','🦸','🦸‍♀️','🧑‍🎓','🎮','⚽']
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

const STEPS = {
  WELCOME:        0,
  FAMILY:         1,
  PARENT_PROFILE: 2,
  PARENT_PIN:     3,
  CHILD_PROFILE:  4,
  CHILD_PIN:      5,
  ADD_MORE:       6,
  CHORES:         7,
  PAYDAY:         8,
  PREVIEW:        9,
  HANDOFF:       10,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectCurrency() {
  const country = (navigator.language || 'en-IN').split('-')[1] || ''
  return ({ IN:'INR', US:'USD', GB:'GBP', AU:'AUD', CA:'CAD', SG:'SGD', AE:'AED' })[country] || 'INR'
}

function round5pct(salary) {
  return Math.max(5, Math.round(salary * 0.05 / 5) * 5)
}

function buildMockPayslip(salary) {
  const tax  = Math.round(salary * 0.10)
  const rent = round5pct(salary)
  const gross = salary
  const net   = Math.max(0, gross - tax - rent)
  const end   = new Date(); end.setDate(end.getDate() + (6 - end.getDay()))
  const start = new Date(end); start.setDate(end.getDate() - 6)
  return {
    periodStart:  start.toISOString().slice(0, 10),
    periodEnd:    end.toISOString().slice(0, 10),
    earnings: {
      baseSalary: salary, adjustedSalary: salary,
      mandatoryCompletionPercent: 1,
      streakBonus: 0, bonusChoreEarnings: 0, bonusChoreItems: [], onVacation: false,
    },
    deductions: { tax, rent, taxRate: 0.10, loanRepayment: 0, recurringUtilities: 0, utilities: [] },
    gross, totalDeductions: tax + rent, net,
    allocations: { spending: net, savings: 0, philanthropy: 0, subGoalContributions: [] },
    interestEarned: 0, creditScore: 500, status: 'settled',
    bonusPotential: 0, pendingTransactions: [], creditDelta: 0,
    loanOutstandingAfter: 0, balancesAfter: { spending: net, savings: 0 },
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PinEntry({ value, onChange }) {
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  const handle = (k) => {
    if (k === '⌫') { onChange(value.slice(0, -1)); return }
    if (value.length < 4) onChange(value + k)
  }
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--bg-raised)', border: `2px solid ${i < value.length ? 'var(--accent-blue)' : 'var(--border)'}` }}>
            {i < value.length && <div className="w-3 h-3 rounded-full" style={{ background: 'var(--accent-blue)' }} />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 w-52">
        {digits.map((d, i) => (
          d === '' ? <div key={i} /> :
          <button key={i} onClick={() => handle(d)}
            className="w-full rounded-xl text-lg font-mono font-medium transition-all active:scale-90"
            style={{ height: 52, background: d === '⌫' ? 'transparent' : 'var(--bg-raised)', border: `1px solid ${d === '⌫' ? 'transparent' : 'var(--border)'}`, color: 'var(--text-primary)' }}>
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}

function AvatarGrid({ avatars, value, onChange }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {avatars.map(a => (
        <button key={a} onClick={() => onChange(a)}
          className="h-11 rounded-xl flex items-center justify-center text-2xl transition-all active:scale-90"
          style={{ background: value === a ? 'rgba(96,165,250,0.15)' : 'var(--bg-raised)', border: `2px solid ${value === a ? 'var(--accent-blue)' : 'transparent'}` }}>
          {a}
        </button>
      ))}
    </div>
  )
}

function ContinueBtn({ label = 'Continue →', disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full py-4 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
      style={{ background: disabled ? 'var(--bg-raised)' : 'var(--accent-blue)', color: disabled ? 'var(--text-dim)' : '#fff', border: `1px solid ${disabled ? 'var(--border)' : 'var(--accent-blue)'}` }}>
      {label}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingFlow({ onComplete, onJoinInstead }) {
  const [step,       setStep]      = useState(STEPS.WELCOME)

  const [familyName, setFamilyName] = useState('')

  const [parentName,       setParentName]       = useState('')
  const [parentAvatar,     setParentAvatar]     = useState('')
  const [parentPin,        setParentPin]        = useState('')
  const [parentPinConfirm, setParentPinConfirm] = useState('')
  const [parentPinError,   setParentPinError]   = useState(null)

  const [children,  setChildren]  = useState([{ name: '', avatar: '', pin: '', pinConfirm: '', salary: '' }])
  const [childIdx,  setChildIdx]  = useState(0)
  const [childPinError, setChildPinError] = useState(null)

  const [chores,    setChores]    = useState(['Make bed', 'Clear dishes'])
  const [paydayDow, setPaydayDow] = useState(6)

  const [currency]  = useState(detectCurrency)

  const [creating,       setCreating]       = useState(false)
  const [error,          setError]          = useState(null)
  const [createdResult,  setCreatedResult]  = useState(null)   // { memberId, deviceId, familyId }
  const [createdChildren, setCreatedChildren] = useState([])   // member objects

  const child = children[childIdx] ?? children[0]

  function updateChild(changes) {
    setChildren(prev => prev.map((c, i) => i === childIdx ? { ...c, ...changes } : c))
  }

  const currSymbol = CURRENCIES[currency]?.symbol ?? '₹'

  // ── Back navigation ───────────────────────────────────────────────────────

  function back() {
    setError(null)
    if (step === STEPS.FAMILY)         return setStep(STEPS.WELCOME)
    if (step === STEPS.PARENT_PROFILE) return setStep(STEPS.FAMILY)
    if (step === STEPS.PARENT_PIN)     { setParentPin(''); setParentPinConfirm(''); setParentPinError(null); return setStep(STEPS.PARENT_PROFILE) }
    if (step === STEPS.CHILD_PROFILE)  {
      if (childIdx > 0) {
        setChildren(prev => prev.slice(0, -1))
        setChildIdx(prev => prev - 1)
        return setStep(STEPS.ADD_MORE)
      }
      return setStep(STEPS.PARENT_PIN)
    }
    if (step === STEPS.CHILD_PIN)   { updateChild({ pin: '', pinConfirm: '' }); setChildPinError(null); return setStep(STEPS.CHILD_PROFILE) }
    if (step === STEPS.ADD_MORE)    return setStep(STEPS.CHILD_PIN)
    if (step === STEPS.CHORES)      return setStep(STEPS.ADD_MORE)
    if (step === STEPS.PAYDAY)      return setStep(STEPS.CHORES)
    if (step === STEPS.PREVIEW)     return setStep(STEPS.PAYDAY)
  }

  // ── Create family (fires from Preview screen) ─────────────────────────────

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const salary0 = parseInt(children[0].salary) || 0
      const starterConfig = {
        currency,
        timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
        payPeriod:        'weekly',
        paydayDow,
        taxRate:          0.10,
        rentAmount:       round5pct(salary0),
        utilitiesAmount:  0,
        loanInterestRate: 0.05,
        autoSettle:       false,
        configTouched:    [],
      }

      const parentPinHash = await hashPin(parentPin)
      const result = await createFamily({
        familyName: `The ${familyName.trim()} Family`,
        memberName: parentName.trim(),
        avatar:     parentAvatar,
        pinHash:    parentPinHash,
        config:     starterConfig,
      })

      const kids = []
      for (const c of children) {
        const pinHash = await hashPin(c.pin)
        const created = await addMember({
          familyId:   result.familyId,
          name:       c.name.trim(),
          avatar:     c.avatar,
          role:       'child',
          pin:        pinHash,
          baseSalary: parseInt(c.salary) || 0,
          accounts:   { spending: 0, savings: 0, philanthropy: 0, subGoals: [], loan: null },
        })
        kids.push(created)
      }

      for (const title of chores.filter(t => t.trim())) {
        await addChore({
          familyId:   result.familyId,
          title:      title.trim(),
          type:       'mandatory',
          recurrence: 'daily',
          value:      0,
          assignedTo: [kids[0].id],
          isActive:   true,
        })
      }

      localStorage.setItem('artha_member_id', result.memberId)
      setCreatedResult(result)
      setCreatedChildren(kids)
      setStep(STEPS.HANDOFF)
    } catch (e) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  // ── Step renderers ────────────────────────────────────────────────────────

  // ── 0: Welcome ────────────────────────────────────────────────────────────
  if (step === STEPS.WELCOME) return (
    <div className="flex flex-col items-center justify-between h-full py-12 px-6">
      <div />
      <div className="flex flex-col items-center gap-4 text-center">
        <div style={{ fontSize: 64 }}>🏠</div>
        <div>
          <p className="text-xs font-mono tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>ARTO</p>
          <h1 className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
            Welcome to Arto
          </h1>
          <p className="text-sm font-mono mt-2" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            The app that teaches your child{'\n'}how money really works.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 w-full">
        <button onClick={() => setStep(STEPS.FAMILY)}
          className="w-full py-4 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}>
          Get Started →
        </button>
        <button onClick={onJoinInstead}
          className="w-full py-3 rounded-xl text-sm font-mono transition-all active:scale-95"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          I have an invite code
        </button>
      </div>
    </div>
  )

  // ── 1: Family name ────────────────────────────────────────────────────────
  if (step === STEPS.FAMILY) return (
    <div className="flex flex-col h-full py-10 px-6 gap-8">
      <button onClick={back} className="self-start -ml-1 p-1" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 1 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          What should we call your family?
        </h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          This is just for display — your kids will see it too.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
          <span className="text-sm font-mono" style={{ color: 'var(--text-dim)' }}>The</span>
          <input autoFocus value={familyName} onChange={e => setFamilyName(e.target.value)}
            placeholder="Kamboj"
            className="flex-1 bg-transparent text-sm font-mono outline-none"
            style={{ color: 'var(--text-primary)' }} />
          <span className="text-sm font-mono" style={{ color: 'var(--text-dim)' }}>Family</span>
        </div>
        {familyName.trim() && (
          <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            "The {familyName.trim()} Family"
          </p>
        )}
      </div>
      <div className="mt-auto">
        <ContinueBtn disabled={!familyName.trim()} onClick={() => setStep(STEPS.PARENT_PROFILE)} />
      </div>
    </div>
  )

  // ── 2: Parent profile ─────────────────────────────────────────────────────
  if (step === STEPS.PARENT_PROFILE) return (
    <div className="flex flex-col h-full py-10 px-6 gap-6 overflow-y-auto">
      <button onClick={back} className="self-start -ml-1 p-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1 shrink-0">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 2 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>Let's set you up first.</h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Name · Avatar · 4-digit PIN (next screen)</p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>YOUR NAME</p>
        <input autoFocus value={parentName} onChange={e => setParentName(e.target.value)}
          placeholder="e.g. Deepak"
          className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PICK AN AVATAR</p>
        <AvatarGrid avatars={PARENT_AVATARS} value={parentAvatar} onChange={setParentAvatar} />
      </div>
      <div className="shrink-0 mt-2">
        <ContinueBtn disabled={!parentName.trim() || !parentAvatar} onClick={() => setStep(STEPS.PARENT_PIN)} />
      </div>
    </div>
  )

  // ── 3: Parent PIN ─────────────────────────────────────────────────────────
  if (step === STEPS.PARENT_PIN) return (
    <div className="flex flex-col items-center h-full py-10 px-6 gap-6">
      <button onClick={back} className="self-start -ml-1 p-1" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1 w-full">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 2 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          {parentPin.length < 4 ? 'Set your PIN' : 'Confirm your PIN'}
        </h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {parentPin.length < 4 ? "You'll use this PIN to log in." : 'Enter the same PIN again.'}
        </p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span style={{ fontSize: 48 }}>{parentAvatar}</span>
        <span className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{parentName}</span>
      </div>
      <PinEntry
        value={parentPin.length < 4 ? parentPin : parentPinConfirm}
        onChange={parentPin.length < 4 ? setParentPin : setParentPinConfirm}
      />
      {parentPinError && (
        <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{parentPinError}</p>
      )}
      {parentPin.length === 4 && parentPinConfirm.length === 4 && (
        <button
          className="w-full py-4 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95 mt-auto"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}
          onClick={() => {
            if (parentPin !== parentPinConfirm) {
              setParentPinConfirm('')
              setParentPinError("PINs don't match — try again")
              return
            }
            setParentPinError(null)
            setStep(STEPS.CHILD_PROFILE)
          }}>
          Continue →
        </button>
      )}
    </div>
  )

  // ── 4: Child profile ──────────────────────────────────────────────────────
  if (step === STEPS.CHILD_PROFILE) return (
    <div className="flex flex-col h-full py-10 px-6 gap-6 overflow-y-auto">
      <button onClick={back} className="self-start -ml-1 p-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1 shrink-0">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 3 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          {childIdx === 0 ? "Now let's add your child." : `Add child ${childIdx + 1}.`}
        </h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Name · Avatar · Weekly salary · PIN (next screen)</p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>CHILD'S NAME</p>
        <input autoFocus value={child.name} onChange={e => updateChild({ name: e.target.value })}
          placeholder="e.g. Aarav"
          className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PICK AN AVATAR</p>
        <AvatarGrid avatars={CHILD_AVATARS} value={child.avatar} onChange={v => updateChild({ avatar: v })} />
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>WEEKLY SALARY</p>
        <p className="text-xs font-mono" style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
          How much they can earn per week if they complete all their chores.
        </p>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-dim)' }}>{currSymbol}</span>
          <input type="number" inputMode="numeric" value={child.salary}
            onChange={e => updateChild({ salary: e.target.value })}
            placeholder="200"
            className="flex-1 bg-transparent text-sm font-mono outline-none"
            style={{ color: 'var(--text-primary)' }} />
        </div>
        <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
          Currency: {CURRENCIES[currency]?.name ?? currency} ·{' '}
          <span style={{ color: 'var(--accent-blue)' }}>Change currency</span> in settings after setup.
        </p>
      </div>
      <div className="shrink-0 mt-2">
        <ContinueBtn
          disabled={!child.name.trim() || !child.avatar || !child.salary}
          onClick={() => setStep(STEPS.CHILD_PIN)}
        />
      </div>
    </div>
  )

  // ── 5: Child PIN ──────────────────────────────────────────────────────────
  if (step === STEPS.CHILD_PIN) return (
    <div className="flex flex-col items-center h-full py-10 px-6 gap-6">
      <button onClick={back} className="self-start -ml-1 p-1" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1 w-full">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 3 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          {child.pin.length < 4 ? `Set ${child.name}'s PIN` : 'Confirm the PIN'}
        </h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {child.pin.length < 4 ? `${child.name} will use this to log in.` : 'Enter the same PIN again.'}
        </p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span style={{ fontSize: 48 }}>{child.avatar}</span>
        <span className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{child.name}</span>
      </div>
      <PinEntry
        value={child.pin.length < 4 ? child.pin : child.pinConfirm}
        onChange={v => child.pin.length < 4 ? updateChild({ pin: v }) : updateChild({ pinConfirm: v })}
      />
      {childPinError && (
        <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{childPinError}</p>
      )}
      {child.pin.length === 4 && child.pinConfirm.length === 4 && (
        <button
          className="w-full py-4 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95 mt-auto"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}
          onClick={() => {
            if (child.pin !== child.pinConfirm) {
              updateChild({ pinConfirm: '' })
              setChildPinError("PINs don't match — try again")
              return
            }
            setChildPinError(null)
            setStep(STEPS.ADD_MORE)
          }}>
          Continue →
        </button>
      )}
    </div>
  )

  // ── 6: Add more children? ─────────────────────────────────────────────────
  if (step === STEPS.ADD_MORE) return (
    <div className="flex flex-col h-full py-10 px-6 gap-8">
      <button onClick={back} className="self-start -ml-1 p-1" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-3">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 3 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          {children.length === 1 ? `${children[0].name} is ready.` : `${children.length} children added.`}
        </h2>
        <div className="flex flex-col gap-1.5">
          {children.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 24 }}>{c.avatar}</span>
              <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
              <span className="text-xs font-mono ml-auto" style={{ color: 'var(--text-dim)' }}>
                {currSymbol}{c.salary}/wk
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <button
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono transition-all active:scale-95"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          onClick={() => {
            setChildren(prev => [...prev, { name: '', avatar: '', pin: '', pinConfirm: '', salary: '' }])
            setChildIdx(prev => prev + 1)
            setStep(STEPS.CHILD_PROFILE)
          }}>
          <Plus size={15} /> Add another child
        </button>
        <ContinueBtn
          label={`Continue with ${children.length === 1 ? 'one child' : `${children.length} children`} →`}
          onClick={() => { setChildIdx(0); setStep(STEPS.CHORES) }}
        />
      </div>
    </div>
  )

  // ── 7: Chores ─────────────────────────────────────────────────────────────
  if (step === STEPS.CHORES) return (
    <div className="flex flex-col h-full py-10 px-6 gap-6 overflow-y-auto">
      <button onClick={back} className="self-start -ml-1 p-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1 shrink-0">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 4 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          What should {children[0].name} do to earn their salary?
        </h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          These are mandatory — {children[0].name}'s salary depends on completing them.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {chores.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={c} onChange={e => setChores(prev => prev.map((x, j) => j === i ? e.target.value : x))}
              placeholder="Chore name"
              className="flex-1 px-4 py-3 rounded-xl text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            {chores.length > 1 && (
              <button onClick={() => setChores(prev => prev.filter((_, j) => j !== i))}
                className="p-2 rounded-lg" style={{ color: 'var(--text-dim)' }}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setChores(prev => [...prev, ''])}
          className="flex items-center gap-2 py-2 text-sm font-mono transition-all active:scale-95"
          style={{ color: 'var(--accent-blue)' }}>
          <Plus size={15} /> Add another chore
        </button>
      </div>
      <p className="text-xs font-mono shrink-0" style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
        💡 Start with 2–3 simple chores. You can add more anytime.
      </p>
      <div className="shrink-0 mt-auto">
        <ContinueBtn
          disabled={chores.filter(c => c.trim()).length === 0}
          onClick={() => setStep(STEPS.PAYDAY)}
        />
      </div>
    </div>
  )

  // ── 8: Payday ─────────────────────────────────────────────────────────────
  if (step === STEPS.PAYDAY) return (
    <div className="flex flex-col h-full py-10 px-6 gap-8">
      <button onClick={back} className="self-start -ml-1 p-1" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 5 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>When is payday?</h2>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Payday is weekly while Arto guides your family through the basics — you'll unlock more options as you progress.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>EVERY</p>
        <div className="flex flex-col gap-2">
          {DAYS.map((day, i) => (
            <button key={i} onClick={() => setPaydayDow(i)}
              className="w-full py-3 px-4 rounded-xl text-sm font-mono text-left transition-all active:scale-95"
              style={{
                background: paydayDow === i ? 'var(--accent-blue)' : 'var(--bg-raised)',
                border: `1px solid ${paydayDow === i ? 'var(--accent-blue)' : 'var(--border)'}`,
                color: paydayDow === i ? '#fff' : 'var(--text-primary)',
              }}>
              {day}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto">
        <ContinueBtn onClick={() => setStep(STEPS.PREVIEW)} />
      </div>
    </div>
  )

  // ── 9: Preview ────────────────────────────────────────────────────────────
  if (step === STEPS.PREVIEW) return (
    <div className="flex flex-col h-full py-10 px-6 gap-6 overflow-y-auto">
      <button onClick={back} className="self-start -ml-1 p-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1 shrink-0">
        <p className="text-xs font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>STEP 6 OF 8</p>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          Here's how {children[0].name}'s first payslip will look:
        </h2>
      </div>
      <PayslipCard
        payslip={buildMockPayslip(parseInt(children[0].salary) || 0)}
        member={{ name: children[0].name, avatar: children[0].avatar }}
        familyName={`The ${familyName.trim()} Family`}
      />
      <div className="px-3 py-3 rounded-xl shrink-0"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Yep — just like real life, not all the money is theirs to spend.{'\n'}
          Tax and rent are set to sensible defaults. You can change them anytime.
        </p>
      </div>
      {error && (
        <p className="text-xs font-mono text-center shrink-0" style={{ color: 'var(--negative)' }}>{error}</p>
      )}
      <div className="shrink-0 mt-2">
        <button onClick={handleCreate} disabled={creating}
          className="w-full py-4 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'var(--accent-blue)', color: '#fff', opacity: creating ? 0.7 : 1 }}>
          {creating ? 'Setting up your family...' : "Start your family's economy →"}
        </button>
      </div>
    </div>
  )

  // ── 10: Handoff ───────────────────────────────────────────────────────────
  if (step === STEPS.HANDOFF) return (
    <div className="flex flex-col h-full py-10 px-6 gap-6 overflow-y-auto">
      <div className="flex flex-col items-center gap-2 text-center shrink-0">
        <span style={{ fontSize: 56 }}>🎉</span>
        <h2 className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>You're all set!</h2>
        <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
          {children[0].name}'s first payday is {DAYS[paydayDow]}.
        </p>
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          NOW SET UP {children[0].name.toUpperCase()}'S DEVICE
        </p>
        <InviteCodePanel member={createdChildren[0]} />
        <p className="text-xs font-mono text-center" style={{ color: 'var(--text-dim)' }}>
          Or do this later from More → Invite Code
        </p>
      </div>

      {createdChildren.length > 1 && (
        <p className="text-xs font-mono text-center shrink-0" style={{ color: 'var(--text-dim)' }}>
          Additional children: generate codes from More → Invite Code.
        </p>
      )}

      <div className="mt-auto shrink-0">
        <button onClick={() => onComplete(createdResult)}
          className="w-full py-4 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}>
          Go to Dashboard →
        </button>
      </div>
    </div>
  )

  return null
}
