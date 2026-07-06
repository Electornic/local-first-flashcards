import Dexie, { type Table } from 'dexie'

// ── 도메인 타입 ──────────────────────────────────────────────
export interface Deck {
  id: string
  name: string
  description?: string
  order: number
  createdAt: number
}

export interface Card {
  id: string
  deckId: string
  front: string
  back: string
  // SRS 상태 — 신규/시드 생성 시 반드시 초기화(없으면 schedule()에서 NaN).
  due: number // epoch ms; "오늘 복습" 쿼리의 킬러 인덱스
  interval: number // days
  ease: number // 2.5 시작
  reps: number
  lapses: number
  order: number
  createdAt: number
}

export interface ReviewLog {
  id: string // write 전에 확정 → 재시도 시 동일 id 재사용(멱등)
  cardId: string
  rating: number // 0=Again 1=Hard 2=Good 3=Easy
  reviewedAt: number
  prevDue: number
  nextDue: number
}

// SRS 초기값 — 카드 생성/시드 로더가 이걸로 세팅해야 함.
export const SRS_INIT = {
  interval: 0,
  ease: 2.5,
  reps: 0,
  lapses: 0,
} as const

// ── Dexie 스키마 (버전 1) ────────────────────────────────────
export class FlashcardsDB extends Dexie {
  deck!: Table<Deck, string>
  card!: Table<Card, string>
  reviewLog!: Table<ReviewLog, string>

  constructor() {
    super('local-first-flashcards')
    this.version(1).stores({
      deck: '&id, order',
      // ★ due = 킬러 인덱스, [deckId+due] = 덱별 due 복합 인덱스
      card: '&id, deckId, due, order, [deckId+due]',
      reviewLog: '&id, cardId, reviewedAt', // append-only
    })
  }
}

export const db = new FlashcardsDB()

// ── eviction 방어 ────────────────────────────────────────────
// 앱 진입 시 1회. best-effort 저장소가 디스크 압박에 LRU로 날아가는 걸 완화.
// (Safari 7일 ITP는 이걸로도 못 막음 → export가 실질 방어.)
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

// ── 백업 경로 (1급 기능) ─────────────────────────────────────
// Safari 7일 ITP / eviction 대비. "영구보존" 가정 금지 → export/import 필수.
export interface BackupPayload {
  version: 1
  exportedAt: number
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
}

export async function exportBackup(): Promise<BackupPayload> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.deck.toArray(),
    db.card.toArray(),
    db.reviewLog.toArray(),
  ])
  return { version: 1, exportedAt: Date.now(), decks, cards, reviewLogs }
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (payload.version !== 1) throw new Error(`지원하지 않는 백업 버전: ${payload.version}`)
  await db.transaction('rw', db.deck, db.card, db.reviewLog, async () => {
    // 덮어쓰기 병합(upsert) — 동일 id는 최신으로.
    await db.deck.bulkPut(payload.decks)
    await db.card.bulkPut(payload.cards)
    await db.reviewLog.bulkPut(payload.reviewLogs)
  })
}

export function downloadBackup(payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 10)
  a.download = `flashcards-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}
