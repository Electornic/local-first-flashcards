import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ensureSeeded } from './data/seed'
import { requestPersistence } from './db'
import './index.css'

// M0 오프라인의 전제: 서비스 워커 앱 셸 프리캐시. autoUpdate.
registerSW({ immediate: true })

async function bootstrap() {
  // eviction 완화(거부될 수 있음 — export가 실질 방어).
  void requestPersistence()
  // 콜드 스타트: 빈 DB면 시드 주입(=온보딩). 중복 주입은 seed 내부에서 가드.
  await ensureSeeded()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
