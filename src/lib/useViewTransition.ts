import { flushSync } from 'react-dom'

// startViewTransition 래퍼 + 폴백.
// ⚠ startViewTransition(cb)은 cb 안에서 DOM이 동기적으로 바뀌길 기대한다.
//    React setState는 비동기 배칭이라 flushSync 없이는 전환 전 DOM으로 캡처돼 모핑이 안 먹는다.
// ⚠ 폴백: View Transitions 미지원(구 Safari <16.4 / 일부 Firefox)에서는 그냥 즉시 실행.
export function withViewTransition(mutate: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (!doc.startViewTransition || prefersReduced) {
    flushSync(mutate)
    return
  }
  doc.startViewTransition(() => {
    flushSync(mutate)
  })
}
