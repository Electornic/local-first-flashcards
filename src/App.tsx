import { useEffect, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from './store'
import { DeckGrid } from './components/DeckGrid'
import { StudyView } from './components/StudyView'
import { CardEditor } from './components/CardEditor'
import { CommandPalette } from './components/CommandPalette'
import { FpsOverlay } from './components/FpsOverlay'
import { db, downloadBackup, exportBackup, importBackup, type BackupPayload } from './db'

export function App() {
  const route = useStore((s) => s.route)
  const streak = useStore((s) => s.streak)
  const lastPopAt = useStore((s) => s.lastPopAt)
  const tickNow = useStore((s) => s.tickNow)
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)
  const pushToast = useStore((s) => s.pushToast)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [editorDeck, setEditorDeck] = useState<string | null>(null)
  const [showFps, setShowFps] = useState(true)

  // ★ nowTick 갱신 — write 없이 시간만 지나 due가 된 카드도 뱃지/큐에 잡히게(30s).
  //   마운트 시 즉시 1회: store 초기 nowTick은 시드 주입 이전 시각이라 최신화 필요.
  useEffect(() => {
    tickNow()
    const id = setInterval(tickNow, 30_000)
    return () => clearInterval(id)
  }, [tickNow])

  // ⌘K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function newDeck() {
    const count = await db.deck.count()
    const id = crypto.randomUUID()
    await db.deck.add({ id, name: '새 덱', description: '', order: count, createdAt: Date.now() })
    setEditorDeck(id)
  }

  async function doExport() {
    downloadBackup(await exportBackup())
    pushToast('백업 JSON을 내려받았습니다')
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload
      await importBackup(payload)
      pushToast('가져오기 완료')
    } catch {
      pushToast('가져오기 실패 — 파일을 확인하세요', 'error')
    }
    e.target.value = ''
  }

  return (
    <div className="app">
      {showFps && <FpsOverlay />}

      <div className="topbar">
        <div>
          <h1>Flashcards</h1>
          <div className="sub">로컬-퍼스트 · 오프라인 동작</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.span
            key={lastPopAt}
            className="chip"
            animate={{ scale: [1, 1.4, 1] }} // 스트릭/카운트 pop
            transition={{ duration: 0.4 }}
          >
            🔥 {streak.streak}일 · 오늘 {streak.todayCount}
          </motion.span>
          <button className="chip" onClick={() => setShowFps((v) => !v)} title="FPS 오버레이 토글">
            {showFps ? 'FPS on' : 'FPS off'}
          </button>
          <button className="chip" onClick={() => setPaletteOpen(true)}>
            ⌘K
          </button>
        </div>
      </div>

      {route === 'decks' ? (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={newDeck}>
              ＋ 새 덱
            </button>
            <button className="btn" onClick={doExport}>
              내보내기
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              가져오기
              <input type="file" accept="application/json" hidden onChange={handleImportFile} />
            </label>
          </div>
          <DeckGrid onEdit={setEditorDeck} />
        </>
      ) : (
        <StudyView />
      )}

      <AnimatePresence>
        {editorDeck && (
          <CardEditor key={editorDeck} deckId={editorDeck} onClose={() => setEditorDeck(null)} />
        )}
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewDeck={newDeck}
        onEditDeck={(id) => {
          setPaletteOpen(false)
          setEditorDeck(id)
        }}
      />

      <div className="toasts">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast ${t.tone}`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, y: 10 }}
              onAnimationComplete={() => window.setTimeout(() => dismissToast(t.id), 2200)}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
