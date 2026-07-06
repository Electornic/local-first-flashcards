import { flushSync } from 'react-dom'
import { db } from '../db'
import { useStore } from '../store'
import { withViewTransition } from './useViewTransition'

// 덱별 due 큐 조회 — 복합 인덱스 [deckId+due]로 즉시.
export async function queryDueQueue(deckId: string) {
  const now = Date.now()
  const due = await db.card
    .where('[deckId+due]')
    .between([deckId, 0], [deckId, now])
    .toArray()
  due.sort((a, b) => a.order - b.order)
  return due
}

// 덱 → 스터디 모핑.
// 1) 큐를 먼저 조회(비동기)해 둔다.
// 2) flushSync로 해당 덱 카드에 view-transition-name(morphDeckId)을 부여 → VT 이전 스냅샷에 반영.
// 3) startViewTransition 콜백 안에서 route를 '동기적으로' 바꿔야(=flushSync) 새 스냅샷이 찍힌다.
export async function openDeck(deckId: string): Promise<void> {
  const queue = await queryDueQueue(deckId)
  const { beginSession } = useStore.getState()

  // 전환 대상 덱 카드에 이름을 먼저 붙인다(구 스냅샷 캡처용).
  flushSync(() => useStore.setState({ morphDeckId: deckId }))

  withViewTransition(() => {
    beginSession(deckId, queue)
  })
}

// 스터디 → 덱 리스트 (되돌아가는 모핑).
export function backToDecks(): void {
  const { goDecks } = useStore.getState()
  withViewTransition(() => {
    goDecks()
  })
}
