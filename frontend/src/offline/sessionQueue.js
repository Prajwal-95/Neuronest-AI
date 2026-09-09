import Dexie from 'dexie'

// IndexedDB schema via Dexie
const db = new Dexie('neuronest-offline')

db.version(1).stores({
  sessions: '++id, client_id, status, game_type, created_at',
  local_meta: 'key',
})

export function makeClientId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function generateId() {
  return makeClientId()
}

export async function saveSessionLocally(session) {
  const record = {
    id: generateId(),
    client_id: session.client_id || makeClientId(),
    status: 'pending_sync',
    game_type: session.game_type,
    data: session,
    created_at: new Date().toISOString(),
  }
  await db.sessions.add(record)
  return record
}

export async function getPendingSessions() {
  return db.sessions.where('status').equals('pending_sync').toArray()
}

export async function getAllLocalSessions() {
  return db.sessions.toArray()
}

export async function markAllSynced() {
  const pending = await getPendingSessions()
  const now = new Date().toISOString()
  for (const rec of pending) {
    await db.sessions.update(rec.id, { status: 'synced', synced_at: now })
  }
  return pending.length
}

export async function removeByClientId(clientId) {
  const recs = await db.sessions.where('client_id').equals(clientId).toArray()
  for (const rec of recs) {
    await db.sessions.delete(rec.id)
  }
}

export async function clearSynced() {
  const synced = await db.sessions.where('status').equals('synced').toArray()
  for (const rec of synced) {
    await db.sessions.delete(rec.id)
  }
  return synced.length
}

export async function getLocalHistory(gameType) {
  const all = await db.sessions.toArray()
  return all
    .filter((r) => r.status === 'synced' || true) // keep all locally
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .filter((r) => (gameType ? r.game_type === gameType : true))
    .slice(0, 30)
    .map((r) => r.data)
}

export async function localAnalytics() {
  const all = await getAllLocalSessions()
  const completed = all.filter((r) => r.data && r.data.completed)
  if (!completed.length) {
    return {
      sessions: 0,
      avg_score: 0,
      avg_accuracy: 0,
      byGame: {},
      weekly: [],
    }
  }
  const scores = completed.map((r) => r.data.score || 0)
  const accs = completed.map((r) => r.data.accuracy || 0)
  const byGame = {}
  for (const r of completed) {
    const g = r.game_type || r.data.game_type
    if (!byGame[g]) byGame[g] = { n: 0, totalScore: 0 }
    byGame[g].n += 1
    byGame[g].totalScore += r.data.score || 0
  }
  for (const g in byGame) byGame[g].avg = round1(byGame[g].totalScore / byGame[g].n)
  return {
    sessions: completed.length,
    avg_score: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
    avg_accuracy: round2(accs.reduce((a, b) => a + b, 0) / accs.length),
    byGame,
    weekly: [],
  }
}

function round1(n) {
  return Math.round(n * 10) / 10
}
function round2(n) {
  return Math.round(n * 100) / 100
}

export { db }