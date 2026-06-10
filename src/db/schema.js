import Dexie from 'dexie'

export const db = new Dexie('ArthaDB')

db.version(1).stores({
  families:      '&id, name',
  members:       '&id, familyId, role',
  chores:        '&id, familyId, type, isActive, *assignedTo',
  choreLogs:     '&id, choreId, memberId, date, status',
  transactions:  '&id, memberId, type, date',
  rewards:       '&id, familyId, isActive',
  payslips:      '&id, memberId, periodEnd',
  utilityCharges:'&id, memberId, date',
})

db.version(2).stores({
  rewardRequests: '&id, memberId, rewardId, status',
})

export default db
