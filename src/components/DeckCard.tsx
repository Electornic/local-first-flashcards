import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, type Deck } from '../db'
import { useStore } from '../store'
import { openDeck } from '../lib/navigation'

export function DeckCard({ deck, onEdit }: { deck: Deck; onEdit: (id: string) => void }) {
  // 뱃지·덱리스트 = useLiveQuery (진행 중 세션 큐가 아니므로 OK).
  // ★ nowTick을 deps에 넣어야 write 없이 시간만 지나 due가 된 카드도 잡힌다.
  const nowTick = useStore((s) => s.nowTick)
  const morphDeckId = useStore((s) => s.morphDeckId)

  const dueCount = useLiveQuery(
    () => db.card.where('[deckId+due]').between([deck.id, 0], [deck.id, nowTick]).count(),
    [deck.id, nowTick],
  )
  const total = useLiveQuery(() => db.card.where('deckId').equals(deck.id).count(), [deck.id])

  // dnd-kit 재정렬 — 드래그 transform은 wrapper에, hover/press spring은 내부 버튼에(transform 충돌 회피).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deck.id,
  })
  const wrapStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    // 전환 대상 덱만 morph 이름 부여(구 스냅샷 캡처용).
    ...(morphDeckId === deck.id ? { viewTransitionName: 'active-deck' } : {}),
  }

  return (
    <div ref={setNodeRef} style={wrapStyle} className="deck-card-wrap">
      <motion.button
        className="deck-card"
        onClick={() => void openDeck(deck.id)}
        whileHover={{ y: -3, boxShadow: '0 14px 40px rgba(0,0,0,0.5)' }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <span
          className="deck-handle"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="드래그로 재정렬"
        >
          ⠿
        </span>
        <h3>{deck.name}</h3>
        {deck.description && <p>{deck.description}</p>}
        <div className="meta">
          <span className="count">
            {total ?? 0}장 ·{' '}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onEdit(deck.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  onEdit(deck.id)
                }
              }}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
              편집
            </span>
          </span>
          <span className={`due-badge ${!dueCount ? 'zero' : ''}`}>{dueCount ?? 0}</span>
        </div>
      </motion.button>
    </div>
  )
}
