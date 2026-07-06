import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { db } from '../db'
import { DeckCard } from './DeckCard'

// 덱 리스트 = useLiveQuery (진행 중 세션 큐 아님 → 안전).
// 재정렬은 Motion Reorder 대신 dnd-kit(2D 순서 점프 회피).
export function DeckGrid({ onEdit }: { onEdit: (id: string) => void }) {
  const decks = useLiveQuery(() => db.deck.orderBy('order').toArray(), [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!decks) return null
  if (decks.length === 0)
    return <div className="empty-state">덱이 없습니다. “＋ 새 덱”으로 시작하세요.</div>

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !decks) return
    const oldI = decks.findIndex((d) => d.id === active.id)
    const newI = decks.findIndex((d) => d.id === over.id)
    if (oldI < 0 || newI < 0) return
    const next = arrayMove(decks, oldI, newI)
    // order를 인덱스로 재기록(write → useLiveQuery 재실행 → UI 반영).
    await db.transaction('rw', db.deck, async () => {
      await Promise.all(next.map((d, i) => db.deck.update(d.id, { order: i })))
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={decks.map((d) => d.id)} strategy={rectSortingStrategy}>
        <div className="deck-grid">
          {decks.map((d) => (
            <DeckCard key={d.id} deck={d} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
