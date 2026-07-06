import type { Card } from '../db'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const DAY_MS = 86_400_000

// 최소 SM-2 (시작 파라미터, 이후 튜닝)
// rating: 0=Again 1=Hard 2=Good 3=Easy
// 전제: 카드는 { interval:0, ease:2.5, reps:0, lapses:0 }로 초기화돼 있어야 함.
export function schedule(c: Card, rating: number, now: number = Date.now()): Card {
  if (rating === 0) {
    // Again → 학습단계 리셋, 1분 뒤
    return { ...c, reps: 0, lapses: c.lapses + 1, interval: 0, due: now + 60_000 }
  }
  // 상한 3.0은 의도적 절제(표준 SM-2는 무상한, 2.5 시작)
  const ease = clamp(c.ease + (0.1 - (3 - rating) * 0.08), 1.3, 3.0)
  // ⚠ 튜닝 TODO: 지금은 Hard(1)도 Good과 같은 interval*ease로 크게 늘어난다.
  //    표준적으로 Hard는 더 짧은 배수(예: interval*1.2)를 쓴다 — 이후 분리.
  const days = c.reps === 0 ? 1 : c.reps === 1 ? 6 : Math.round(c.interval * ease)
  return { ...c, reps: c.reps + 1, ease, interval: days, due: now + days * DAY_MS }
}

// 채점 버튼 라벨
export const RATINGS = [
  { rating: 0, label: 'Again', key: '1' },
  { rating: 1, label: 'Hard', key: '2' },
  { rating: 2, label: 'Good', key: '3' },
  { rating: 3, label: 'Easy', key: '4' },
] as const

// 미리보기: 각 채점의 다음 due까지 사람이 읽는 간격
export function previewInterval(c: Card, rating: number, now: number = Date.now()): string {
  const next = schedule(c, rating, now)
  const ms = next.due - now
  if (ms < 60_000) return '<1분'
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}분`
  if (ms < DAY_MS) return `${Math.round(ms / 3_600_000)}시간`
  return `${Math.round(ms / DAY_MS)}일`
}
