import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../store'
import { Flashcard } from './Flashcard'
import { RATINGS, previewInterval } from '../lib/srs'
import { backToDecks } from '../lib/navigation'

export function StudyView() {
  const session = useStore((s) => s.session)
  const flip = useStore((s) => s.flip)
  const grade = useStore((s) => s.grade)
  const [shaking, setShaking] = useState(false)
  const shakeTimer = useRef(0)

  const flipped = session?.flipped ?? false
  const index = session?.index ?? 0
  const queueLen = session?.queue.length ?? 0
  const done = !session || index >= queueLen

  // 채점 — Again은 흔들림 후 advance, 나머지는 즉시.
  function handleGrade(rating: number) {
    if (rating === 0) {
      setShaking(true)
      window.clearTimeout(shakeTimer.current)
      shakeTimer.current = window.setTimeout(() => {
        setShaking(false)
        grade(0)
      }, 300)
    } else {
      grade(rating)
    }
  }

  // 키보드: space/enter 뒤집기, 뒤집힌 뒤 1-4 채점.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        flip()
        return
      }
      if (flipped) {
        const r = RATINGS.find((x) => x.key === e.key)
        if (r) {
          e.preventDefault()
          handleGrade(r.rating)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, flipped])

  useEffect(() => () => window.clearTimeout(shakeTimer.current), [])

  if (done) {
    return (
      <div className="session-done">
        <motion.div
          className="big"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.3, 1] }} // 완료 pop
          transition={{ duration: 0.5 }}
        >
          🎉
        </motion.div>
        <h2>세션 완료</h2>
        <p>
          {session?.reviewedCount ?? 0}장 복습 · Again {session?.againCount ?? 0}
        </p>
        <button className="btn primary" onClick={backToDecks}>
          덱으로 돌아가기
        </button>
      </div>
    )
  }

  const card = session.queue[index]
  const remaining = queueLen - index
  const pct = queueLen ? Math.round((index / queueLen) * 100) : 0

  return (
    <div className="study">
      <div className="study-head">
        <button className="btn ghost" onClick={backToDecks}>
          ← 덱
        </button>
        <div
          className="progress-ring"
          style={{ '--p': pct } as CSSProperties}
          aria-label={`남은 ${remaining}장`}
        >
          <span>{remaining}</span>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        <Flashcard
          key={card.id}
          card={card}
          flipped={flipped}
          onFlip={() => flip()}
          shaking={shaking}
        />
      </AnimatePresence>

      <div className="flip-hint">
        {flipped ? '채점하세요 · 키 1–4' : '스페이스 / 클릭으로 뒤집기'}
      </div>

      <div className="grade-row">
        {RATINGS.map((r) => (
          <button
            key={r.rating}
            className="grade-btn"
            data-r={r.rating}
            disabled={!flipped}
            style={{ opacity: flipped ? 1 : 0.4 }}
            onClick={() => handleGrade(r.rating)}
          >
            <span className="g-label">{r.label}</span>
            <span className="g-int">{flipped ? previewInterval(card, r.rating) : r.key}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
