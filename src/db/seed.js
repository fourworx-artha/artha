import { supabase } from './supabase'
import { DEFAULT_CONFIG } from '../utils/constants'
import { getFamilyId } from '../utils/family'
import { hashPin } from '../auth/pinUtils'

export async function seedFamily() {
  if (!import.meta.env.DEV) return

  // Check if members already exist (more reliable than checking family)
  const { count } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', getFamilyId())

  if (count > 0) return // Already seeded

  // Remove any partial family row from a previous failed seed
  await supabase.from('families').delete().eq('id', getFamilyId())

  const [parentPin, sonPin, daughterPin] = await Promise.all([
    hashPin('0000'),
    hashPin('1111'),
    hashPin('2222'),
  ])

  // ── Family ──────────────────────────────────────────────────────
  const { error: famErr } = await supabase.from('families').insert({
    id:               getFamilyId(),
    name:             "Dev's Family",
    config:           { ...DEFAULT_CONFIG },
    tax_fund_balance: 0,
    tax_fund_history: [],
  })
  if (famErr) throw new Error(`families insert: ${famErr.message}`)

  // ── Members ─────────────────────────────────────────────────────
  const { error: memErr } = await supabase.from('members').insert([
    {
      id:           'member-dev',
      family_id:    getFamilyId(),
      name:         'Dev',
      role:         'parent',
      pin:     parentPin,
      avatar:       '👨',
      base_salary:  0,
      accounts:     { spending: 0, savings: 0, goalJar: null },
      credit_score: 500,
    },
    {
      id:           'member-spouse',
      family_id:    getFamilyId(),
      name:         'Spouse',
      role:         'parent',
      pin:     parentPin,
      avatar:       '👩',
      base_salary:  0,
      accounts:     { spending: 0, savings: 0, goalJar: null },
      credit_score: 500,
    },
    {
      id:           'member-son',
      family_id:    getFamilyId(),
      name:         'Son',
      role:         'child',
      pin:     sonPin,
      avatar:       '👦',
      base_salary:  200,
      accounts:     {
        spending: 0,
        savings:  0,
        goalJar:  { name: 'Lego Set', target: 700, balance: 0 },
      },
      credit_score: 500,
    },
    {
      id:           'member-daughter',
      family_id:    getFamilyId(),
      name:         'Daughter',
      role:         'child',
      pin:     daughterPin,
      avatar:       '👧',
      base_salary:  100,
      accounts:     {
        spending: 0,
        savings:  0,
        goalJar:  { name: 'Doll House', target: 500, balance: 0 },
      },
      credit_score: 500,
    },
  ])
  if (memErr) throw new Error(`members insert: ${memErr.message}`)

  // ── Mandatory Chores — Son ───────────────────────────────────────
  const sonMandatory = [
    { title: 'Morning Prayer',                         recurrence: 'daily'   },
    { title: 'Drink Holy Ganga Jal',                   recurrence: 'daily'   },
    { title: 'Make own bed',                           recurrence: 'daily'   },
    { title: 'Pack bag for tomorrow',                  recurrence: 'weekday' },
    { title: 'Brush teeth (night)',                    recurrence: 'daily'   },
    { title: 'Eat Triphala',                           recurrence: 'daily'   },
    { title: 'Reset shoes',                            recurrence: 'daily'   },
    { title: 'Reset living room',                      recurrence: 'daily'   },
    { title: 'Guitar practice 20 min',                 recurrence: 'daily'   },
    { title: 'Tell something good that happened today', recurrence: 'daily'  },
    { title: "Touch elders' feet",                     recurrence: 'daily'   },
  ]

  // ── Mandatory Chores — Daughter ──────────────────────────────────
  const daughterMandatory = [
    { title: 'Morning Prayer',       recurrence: 'daily' },
    { title: 'Drink Holy Ganga Jal', recurrence: 'daily' },
    { title: 'Make own bed',         recurrence: 'daily' },
    { title: 'Brush teeth (night)',  recurrence: 'daily' },
    { title: "Touch elders' feet",   recurrence: 'daily' },
  ]

  const mandatoryChores = [
    ...sonMandatory.map((c, i) => ({
      id:            `chore-son-m-${i}`,
      family_id:     getFamilyId(),
      title:         c.title,
      type:          'mandatory',
      value:         0,
      recurrence:    c.recurrence,
      days_per_week: null,
      assigned_to:   ['member-son'],
      is_active:     true,
    })),
    ...daughterMandatory.map((c, i) => ({
      id:            `chore-daughter-m-${i}`,
      family_id:     getFamilyId(),
      title:         c.title,
      type:          'mandatory',
      value:         0,
      recurrence:    c.recurrence,
      days_per_week: null,
      assigned_to:   ['member-daughter'],
      is_active:     true,
    })),
  ]

  // ── Bonus Chores ────────────────────────────────────────────────
  const bonusChores = [
    { title: 'Mop kitchen',              value: 15,  recurrence: 'weekend', days_per_week: null },
    { title: 'Mop entire house',         value: 30,  recurrence: 'weekend', days_per_week: null },
    { title: 'Water plants',             value: 10,  recurrence: 'weekend', days_per_week: null },
    { title: 'Clean car inside',         value: 20,  recurrence: 'weekend', days_per_week: null },
    { title: 'Reset study table & room', value: 15,  recurrence: 'weekend', days_per_week: null },
    { title: 'No Sweet Day',             value: 20,  recurrence: 'daily',   days_per_week: null },
    { title: 'No Junk Food Day',         value: 10,  recurrence: 'daily',   days_per_week: null },
    { title: 'Learn 3 new words',        value: 15,  recurrence: 'weekly',  days_per_week: null },
    { title: 'French practice 30 min',   value: 12,  recurrence: 'custom',  days_per_week: 3   },
    { title: 'Tennis coaching (attended)', value: 10, recurrence: 'weekday', days_per_week: null },
  ].map((c, i) => ({
    id:            `chore-bonus-${i}`,
    family_id:     getFamilyId(),
    title:         c.title,
    type:          'bonus',
    value:         c.value,
    recurrence:    c.recurrence,
    days_per_week: c.days_per_week,
    assigned_to:   [],
    is_active:     true,
  }))

  await supabase.from('chores').insert([...mandatoryChores, ...bonusChores])

  // ── Rewards ──────────────────────────────────────────────────────
  const rewards = [
    { title: '30 min Screen Time',      cost: 15,   category: 'screen_time', emoji: '📱' },
    { title: '60 min Screen Time',      cost: 25,   category: 'screen_time', emoji: '📺' },
    { title: 'Candy Bar',               cost: 20,   category: 'treat',       emoji: '🍫' },
    { title: 'Chips',                   cost: 20,   category: 'treat',       emoji: '🥨' },
    { title: 'Ice Cream',               cost: 30,   category: 'treat',       emoji: '🍦' },
    { title: 'Boba Drink',              cost: 40,   category: 'treat',       emoji: '🧋' },
    { title: 'Starbucks / Café visit',  cost: 60,   category: 'experience',  emoji: '☕' },
    { title: 'Movie in Theatre',        cost: 150,  category: 'experience',  emoji: '🎬' },
    { title: 'New Clothes',             cost: 200,  category: 'material',    emoji: '👕' },
    { title: 'One Day Car Trip',        cost: 300,  category: 'experience',  emoji: '🚗' },
    { title: 'Live Sporting Event',     cost: 450,  category: 'experience',  emoji: '🏏' },
    { title: 'Lego Toy (small)',        cost: 700,  category: 'material',    emoji: '🧱' },
    { title: 'Lego Toy (large)',        cost: 1200, category: 'material',    emoji: '🏗️' },
    { title: 'Beach Vacation',          cost: 2000, category: 'experience',  emoji: '🏖️' },
  ].map((r, i) => ({
    id:        `reward-${i}`,
    family_id: getFamilyId(),
    ...r,
    is_active: true,
  }))

  await supabase.from('rewards').insert(rewards)

  console.log('[Artha] Family seeded into Supabase successfully.')
}
