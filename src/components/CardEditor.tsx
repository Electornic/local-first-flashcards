import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, SRS_INIT } from '../db'

// 덱 메타 + 카드 CRUD. 카드는 SRS_INIT + due:now 로 생성(없으면 schedule에서 NaN).
export function CardEditor({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const deck = useLiveQuery(() => db.deck.get(deckId), [deckId])
  const cards = useLiveQuery(() => db.card.where('deckId').equals(deckId).sortBy('order'), [deckId])

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  // 덱이 로드되면 폼 초기화(덱 전환 시 1회).
  useEffect(() => {
    if (deck) {
      setName(deck.name)
      setDesc(deck.description ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id])

  async function saveMeta() {
    if (!deck) return
    await db.deck.update(deckId, { name: name.trim() || '제목 없음', description: desc.trim() })
  }

  async function submitCard() {
    if (!front.trim() || !back.trim()) return
    if (editingId) {
      await db.card.update(editingId, { front: front.trim(), back: back.trim() })
    } else {
      await db.card.add({
        id: crypto.randomUUID(),
        deckId,
        front: front.trim(),
        back: back.trim(),
        due: Date.now(), // 바로 due
        order: cards?.length ?? 0,
        createdAt: Date.now(),
        ...SRS_INIT,
      })
    }
    setFront('')
    setBack('')
    setEditingId(null)
  }

  async function removeCard(id: string) {
    await db.transaction('rw', db.card, db.reviewLog, async () => {
      await db.card.delete(id)
      await db.reviewLog.where('cardId').equals(id).delete()
    })
    if (editingId === id) {
      setEditingId(null)
      setFront('')
      setBack('')
    }
  }

  async function removeDeck() {
    if (!confirm(`"${deck?.name}" 덱과 카드 전체를 삭제할까요?`)) return
    const ids = (cards ?? []).map((c) => c.id)
    await db.transaction('rw', db.deck, db.card, db.reviewLog, async () => {
      await db.card.where('deckId').equals(deckId).delete()
      await db.deck.delete(deckId)
      if (ids.length) await db.reviewLog.where('cardId').anyOf(ids).delete()
    })
    onClose()
  }

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        initial={{ y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 24, scale: 0.97, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>덱 편집</h2>
        <div className="field">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveMeta} />
        </div>
        <div className="field">
          <label>설명</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveMeta} />
        </div>

        <div className="field">
          <label>{editingId ? '카드 수정' : '카드 추가'}</label>
          <input
            placeholder="앞면 (질문)"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
          <textarea
            placeholder="뒷면 (답)"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitCard()
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={submitCard}>
              {editingId ? '저장' : '추가'}
            </button>
            {editingId && (
              <button
                className="btn ghost"
                onClick={() => {
                  setEditingId(null)
                  setFront('')
                  setBack('')
                }}
              >
                취소
              </button>
            )}
          </div>
        </div>

        <div className="card-list">
          {(cards ?? []).map((c) => (
            <div className="card-row" key={c.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="c-front">{c.front}</div>
                <div className="c-back">{c.back}</div>
              </div>
              <button
                className="icon-btn"
                aria-label="수정"
                onClick={() => {
                  setEditingId(c.id)
                  setFront(c.front)
                  setBack(c.back)
                }}
              >
                ✎
              </button>
              <button
                className="icon-btn danger"
                aria-label="삭제"
                onClick={() => removeCard(c.id)}
              >
                🗑
              </button>
            </div>
          ))}
          {cards && cards.length === 0 && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 4px' }}>
              카드가 없습니다.
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="btn ghost"
            onClick={removeDeck}
            style={{ marginRight: 'auto', color: 'var(--again)' }}
          >
            덱 삭제
          </button>
          <button className="btn primary" onClick={onClose}>
            완료
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
