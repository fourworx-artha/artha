/**
 * One-time migration: reads all data from Dexie (IndexedDB) and writes it to Supabase.
 * Run once per device. Safe to run again — if Supabase already has the family, it aborts.
 */
import { db } from './schema'
import { importAllData, getFamily } from './operations'
import { getFamilyId } from '../utils/family'

export async function migrateToSupabase() {
  // Read everything from Dexie
  const [
    families, members, chores, choreLogs, transactions,
    rewards, payslips, utilityCharges, rewardRequests,
  ] = await Promise.all([
    db.families.toArray(),
    db.members.toArray(),
    db.chores.toArray(),
    db.choreLogs.toArray(),
    db.transactions.toArray(),
    db.rewards.toArray(),
    db.payslips.toArray(),
    db.utilityCharges.toArray(),
    db.rewardRequests?.toArray() ?? Promise.resolve([]),
  ])

  if (!families.length) throw new Error('No local data found. Nothing to migrate.')

  // importAllData expects camelCase (same shape as exportAllData output)
  await importAllData({
    exportedAt: new Date().toISOString(),
    version: 2,
    families,
    members,
    chores,
    choreLogs,
    transactions,
    rewards,
    payslips,
    utilityCharges,
    rewardRequests,
  })

  return {
    families: families.length,
    members: members.length,
    chores: chores.length,
    choreLogs: choreLogs.length,
    transactions: transactions.length,
    payslips: payslips.length,
  }
}
