import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, X, Check } from 'lucide-react'
import { useFamily, useCurrency } from '../../context/FamilyContext'
import { updateMember, addMember } from '../../db/operations'
import { hashPin } from '../../auth/pinUtils'
import { getFamilyId } from '../../utils/family'

const CHILD_AVATARS = [
  '👦','👧','🧒','👶','🐒','🐻','🦁','🐯',
  '🐸','🐼','🦊','🐨','🦄','🦋','🐬','🦅',
]

const PARENT_AVATARS = [
  '👨','👩','👴','👵','🧑','👨‍💼','👩‍💼','👨‍🦱',
  '👩‍🦱','👨‍🦳','👩‍🦳','🧔','👱','👱‍♀️','🙎','🙎‍♀️',
]

// ── Member edit / create sheet ────────────────────────────────────────────────
function MemberSheet({ member, addingRole, onDone, onClose }) {
  const isNew = !member
  const fmt   = useCurrency()

  // When adding new: addingRole tells us 'child' or 'parent'
  const isParent = member ? member.role === 'parent' : addingRole === 'parent'

  const defaultAvatar = isParent ? '👨' : '👦'
  const [name,       setName]       = useState(member?.name ?? '')
  const [avatar,     setAvatar]     = useState(member?.avatar ?? defaultAvatar)
  const [salary,     setSalary]     = useState(String(member?.baseSalary ?? 0))
  const [newPin,     setNewPin]     = useState('')
  const [goalName,   setGoalName]   = useState(member?.accounts?.goalJar?.name ?? '')
  const [goalTarget, setGoalTarget] = useState(String(member?.accounts?.goalJar?.target ?? 0))
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (isNew && (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin))) {
      setError('PIN must be exactly 4 digits'); return
    }
    if (newPin && (newPin.length !== 4 || !/^\d{4}$/.test(newPin))) {
      setError('PIN must be exactly 4 digits'); return
    }

    setSaving(true)
    setError('')
    try {
      const changes = { name: name.trim(), avatar }

      if (!isParent) {
        changes.baseSalary = Number(salary) || 0
      }

      if (newPin) {
        changes.pin = await hashPin(newPin)
      }

      if (isNew) {
        if (isParent) {
          await addMember({
            familyId: getFamilyId(),
            role: 'parent',
            name: changes.name,
            avatar: changes.avatar,
            pin: changes.pin,
            // accounts omitted — addMember supplies the canonical default shape
          })
        } else {
          const goalJar = goalName.trim()
            ? { name: goalName.trim(), target: Number(goalTarget) || 100, balance: 0 }
            : null

          await addMember({
            familyId: getFamilyId(),
            role: 'child',
            name: changes.name,
            avatar: changes.avatar,
            pin: changes.pin,
            baseSalary: changes.baseSalary,
            accounts: { spending: 0, savings: 0, philanthropy: 0, subGoals: [], loan: null, goalJar },
            creditScore: 500,
          })
        }
      } else {
        // Update goal jar for existing children — preserve balance, only update name/target
        if (!isParent) {
          const existingJar = member.accounts?.goalJar ?? { balance: 0 }
          const hasGoalInput = goalName.trim() || Number(goalTarget) > 0
          // Defaults first: heals members created before the full accounts shape
          // (spending/savings/goalJar only) so validateAccounts passes downstream
          changes.accounts = {
            spending: 0, savings: 0, philanthropy: 0, subGoals: [], loan: null,
            ...member.accounts,
            goalJar: hasGoalInput
              ? {
                  ...existingJar,
                  name:   goalName.trim() || existingJar.name || 'My Goal',
                  target: Number(goalTarget) || existingJar.target || 100,
                }
              : existingJar.name  // keep existing if no input (don't wipe)
                ? existingJar
                : null,
          }
        }
        await updateMember(member.id, changes)
      }

      await onDone()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-t-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-bright)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isNew ? (isParent ? 'Add Parent' : 'Add Child') : `Edit — ${member.name}`}
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* Avatar picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>AVATAR</label>
            <div className="grid grid-cols-8 gap-2">
              {(isParent ? PARENT_AVATARS : CHILD_AVATARS).map(e => (
                <button
                  key={e}
                  onClick={() => setAvatar(e)}
                  className="text-2xl rounded-xl flex items-center justify-center transition-all"
                  style={{
                    padding: '6px',
                    background: avatar === e ? 'var(--accent-blue)' : 'var(--bg-raised)',
                    border: `2px solid ${avatar === e ? 'var(--accent-blue)' : 'transparent'}`,
                    opacity: avatar === e ? 1 : 0.7,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>NAME</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder={isParent ? "Parent's name" : "Child's name"}
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>


          {/* Salary (children only) */}
          {!isParent && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                WEEKLY SALARY
              </label>
              <input
                type="number" min={0} value={salary}
                onChange={e => setSalary(e.target.value)}
                placeholder="e.g. 200"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                Gross before tax/rent. Divided proportionally across chores.
              </p>
            </div>
          )}

          {/* Goal Jar (optional) */}
          {!isParent && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                GOAL JAR (optional)
              </label>
              <input
                value={goalName} onChange={e => setGoalName(e.target.value)}
                placeholder="Goal name, e.g. Doll House"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                type="number" min={1} value={goalTarget}
                onChange={e => setGoalTarget(e.target.value)}
                placeholder="Target amount, e.g. 500"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          )}

          {/* PIN */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {isNew ? 'SET PIN (4 digits)' : 'CHANGE PIN (leave blank to keep current)'}
            </label>
            <input
              type="password" inputMode="numeric" maxLength={4}
              value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4-digit PIN"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {error && (
            <p className="text-xs font-mono" style={{ color: 'var(--negative)' }}>{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-mono font-semibold transition-all active:scale-95"
            style={{
              background: saving ? 'var(--border)' : 'var(--accent-blue)',
              color: saving ? 'var(--text-dim)' : '#fff',
            }}
          >
            {saving ? 'Saving...' : isNew ? (isParent ? 'Add Parent' : 'Add Child') : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Members() {
  const navigate = useNavigate()
  const { members, children, parents, reload } = useFamily()
  const fmt = useCurrency()

  const [editing,    setEditing]    = useState(null)   // member object, or null for new
  const [addingRole, setAddingRole] = useState('child')
  const [showSheet,  setShowSheet]  = useState(false)

  const openEdit = (member) => {
    setEditing(member)
    setShowSheet(true)
  }
  const openAdd = (role) => {
    setEditing(null)
    setAddingRole(role)
    setShowSheet(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate(-1)} style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</p>
          <h2 className="text-base font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            Family Members
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openAdd('child')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            <Plus size={14} />
            Child
          </button>
          <button
            onClick={() => openAdd('parent')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <Plus size={14} />
            Parent
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Children */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>CHILDREN</p>
          {children.map(child => (
            <div
              key={child.id}
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <span className="text-3xl">{child.avatar}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {child.name}
                </p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {fmt(child.baseSalary)}/wk salary
                  {child.accounts?.goalJar && ` · 🎯 ${child.accounts.goalJar.name}`}
                </p>
              </div>
              <button
                onClick={() => openEdit(child)}
                className="p-2 rounded-lg transition-all active:scale-95"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
          {children.length === 0 && (
            <p className="text-xs font-mono text-center py-4" style={{ color: 'var(--text-dim)' }}>
              No children yet — add one above
            </p>
          )}
        </div>

        {/* Parents */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-mono px-1" style={{ color: 'var(--text-muted)' }}>PARENTS</p>
          {parents.map(parent => (
            <div
              key={parent.id}
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <span className="text-3xl">{parent.avatar}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {parent.name}
                </p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Parent account
                </p>
              </div>
              <button
                onClick={() => openEdit(parent)}
                className="p-2 rounded-lg transition-all active:scale-95"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {showSheet && (
        <MemberSheet
          member={editing}
          addingRole={addingRole}
          onDone={reload}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  )
}
