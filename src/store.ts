import { create } from 'zustand'
import { db, type Card } from './db'
import { schedule } from './lib/srs'

export type Route = 'decks' | 'study'

// Again 카드를 이번 세션에서 다시 보여주기 위해 큐의 몇 장 뒤에 재삽입할지.
const AGAIN_GAP = 5

export interface Toast {
  id: string
  message: string
  tone: 'error' | 'info'
}

interface SessionState {
  deckId: string
  // ★ 세션 시작 시 zustand 스냅샷으로 고정(진행 중 live query 금지).
  //    Again 재삽입도 이 인메모리 큐에서만 일어난다.
  queue: Card[]
  index: number
  flipped: boolean
  reviewedCount: number
  againCount: number
  startedAt: number
}

interface StreakState {
  date: string // YYYY-MM-DD
  todayCount: number
  streak: number
}

interface AppState {
  route: Route
  activeDeckId: string | null
  session: SessionState | null
  toasts: Toast[]
  nowTick: number // 뱃지/큐 useLiveQuery deps용 — setInterval로 갱신
  streak: StreakState
  lastPopAt: number // 완료 카운트 pop 트리거
  morphDeckId: string | null // VT 모핑 대상(전환 순간에만 set)

  setRoute: (r: Route) => void
  goDecks: () => void
  beginSession: (deckId: string, queue: Card[]) => void
  startStudy: (deckId: string) => Promise<void>
  flip: (v?: boolean) => void
  grade: (rating: number) => void
  endStudy: () => void
  tickNow: () => void
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

// ── streak (localStorage) ────────────────────────────────────
const STREAK_KEY = 'flashcards.streak'
function todayStr(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}
function loadStreak(): StreakState {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (raw) return JSON.parse(raw) as StreakState
  } catch {
    /* ignore */
  }
  return { date: todayStr(), todayCount: 0, streak: 0 }
}
function bumpStreak(prev: StreakState): StreakState {
  const today = todayStr()
  if (prev.date === today) {
    return { ...prev, todayCount: prev.todayCount + 1 }
  }
  const yesterday = todayStr(Date.now() - 86_400_000)
  const streak = prev.date === yesterday ? prev.streak + 1 : 1
  return { date: today, todayCount: 1, streak }
}

// ── 백그라운드 write (멱등 + 재시도) ─────────────────────────
async function persistReview(
  prev: Card,
  updated: Card,
  rating: number,
  logId: string,
  attempt = 0,
): Promise<void> {
  try {
    await db.transaction('rw', db.card, db.reviewLog, async () => {
      await db.card.update(prev.id, {
        due: updated.due,
        interval: updated.interval,
        ease: updated.ease,
        reps: updated.reps,
        lapses: updated.lapses,
      })
      // ★ 멱등: 동일 logId로 put → 재시도해도 한 행.
      await db.reviewLog.put({
        id: logId,
        cardId: prev.id,
        rating,
        reviewedAt: Date.now(),
        prevDue: prev.due,
        nextDue: updated.due,
      })
    })
  } catch (err) {
    if (attempt < 2) {
      // 낙관적 advance는 이미 UI에 반영됨 → 조용히 재시도.
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      return persistReview(prev, updated, rating, logId, attempt + 1)
    }
    throw err
  }
}

export const useStore = create<AppState>((set, get) => ({
  route: 'decks',
  activeDeckId: null,
  session: null,
  toasts: [],
  nowTick: Date.now(),
  streak: loadStreak(),
  lastPopAt: 0,
  morphDeckId: null,

  setRoute: (r) => set({ route: r }),

  goDecks: () => set({ route: 'decks', session: null, activeDeckId: null, morphDeckId: null }),

  // 동기 커밋 — VT 콜백(flushSync) 안에서 route가 즉시 바뀌어야 모핑이 캡처된다.
  beginSession: (deckId, queue) =>
    set({
      route: 'study',
      activeDeckId: deckId,
      morphDeckId: null,
      session: {
        deckId,
        queue,
        index: 0,
        flipped: false,
        reviewedCount: 0,
        againCount: 0,
        startedAt: Date.now(),
      },
    }),

  // 폴백/비-VT 경로(예: 팔레트) — 조회 후 커밋.
  startStudy: async (deckId) => {
    const now = Date.now()
    const due = await db.card
      .where('[deckId+due]')
      .between([deckId, 0], [deckId, now])
      .toArray()
    due.sort((a, b) => a.order - b.order)
    get().beginSession(deckId, due)
  },

  flip: (v) =>
    set((s) =>
      s.session ? { session: { ...s.session, flipped: v ?? !s.session.flipped } } : {},
    ),

  grade: (rating) => {
    const s = get()
    const session = s.session
    if (!session) return
    const card = session.queue[session.index]
    if (!card) return

    const now = Date.now()
    const updated = schedule(card, rating, now)
    const logId = crypto.randomUUID()

    // 인메모리 큐 갱신 — 스냅샷은 얼어 있으므로 Again은 여기서 재삽입해야 이번 세션에 다시 나온다.
    const queue = session.queue.slice()
    if (rating === 0) {
      const insertAt = Math.min(session.index + AGAIN_GAP, queue.length)
      queue.splice(insertAt, 0, updated)
    }

    const nextStreak = bumpStreak(s.streak)
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(nextStreak))
    } catch {
      /* ignore */
    }

    // 낙관적 advance — 즉시 다음 카드. write는 백그라운드.
    set({
      session: {
        ...session,
        queue,
        index: session.index + 1,
        flipped: false,
        reviewedCount: session.reviewedCount + 1,
        againCount: session.againCount + (rating === 0 ? 1 : 0),
      },
      streak: nextStreak,
      lastPopAt: now,
    })

    persistReview(card, updated, rating, logId).catch(() => {
      get().pushToast('저장 실패 — 나중에 다시 시도됩니다', 'error')
    })
  },

  endStudy: () => set({ route: 'decks', session: null, activeDeckId: null }),

  tickNow: () => set({ nowTick: Date.now() }),

  pushToast: (message, tone = 'info') =>
    set((s) => ({
      toasts: [...s.toasts, { id: crypto.randomUUID(), message, tone }],
    })),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
