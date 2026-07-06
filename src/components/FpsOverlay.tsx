import { useEffect, useRef, useState } from 'react'

// instant-smooth-ui-demo-spec의 FpsOverlay 이식.
// 뒤집기 + 카드 넘김이 16ms(≈60fps) 유지되는지. 검증은 CPU 4x 스로틀 기준.
export function FpsOverlay() {
  const [fps, setFps] = useState(60)
  const raf = useRef(0)
  const last = useRef(performance.now())
  const frames = useRef(0)
  const acc = useRef(0)

  useEffect(() => {
    let mounted = true
    const loop = (t: number) => {
      const dt = t - last.current
      last.current = t
      frames.current += 1
      acc.current += dt
      if (acc.current >= 500) {
        setFps(Math.round((1000 * frames.current) / acc.current))
        frames.current = 0
        acc.current = 0
      }
      if (mounted) raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      mounted = false
      cancelAnimationFrame(raf.current)
    }
  }, [])

  const cls = fps >= 55 ? '' : fps >= 40 ? 'warn' : 'bad'
  return (
    <div className={`fps ${cls}`} aria-hidden>
      {fps} fps
    </div>
  )
}
