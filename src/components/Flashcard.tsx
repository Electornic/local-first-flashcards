import { motion } from 'motion/react'
import type { Card } from '../db'

// 카드 뒤집기(시그니처) + 넘김 애니메이션.
// 역할 분리: 뒤집기 = rotateY spring(내부), 넘김 = AnimatePresence(부모가 card.id로 key).
export function Flashcard({
  card,
  flipped,
  onFlip,
  shaking,
}: {
  card: Card
  flipped: boolean
  onFlip: () => void
  shaking: boolean
}) {
  return (
    <motion.div
      className="flip-scene"
      initial={{ y: 44, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1, x: shaking ? [0, -7, 7, -5, 5, 0] : 0 }}
      exit={{ y: -64, opacity: 0, scale: 0.96 }}
      transition={{
        default: { type: 'spring', stiffness: 320, damping: 30 },
        x: { duration: 0.32 }, // Again 흔들림(롤백 흔들림 재사용)
      }}
    >
      <motion.div
        className="flip-card"
        onClick={onFlip}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }} // 종이처럼 팍 → 살짝 정착
      >
        <div className="flip-face front">
          <span className="face-label">Q</span>
          <div className="face-text">{card.front}</div>
        </div>
        <div className="flip-face back">
          <span className="face-label">A</span>
          <div className="face-text">{card.back}</div>
        </div>
      </motion.div>
    </motion.div>
  )
}
