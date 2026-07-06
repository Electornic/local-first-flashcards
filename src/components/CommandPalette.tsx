import { Command } from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { openDeck } from '../lib/navigation'

// ⌘K 팔레트 — 덱 이동 / 스터디 시작 / 카드 생성 / 검색.
export function CommandPalette({
  open,
  onClose,
  onNewDeck,
  onEditDeck,
}: {
  open: boolean
  onClose: () => void
  onNewDeck: () => void
  onEditDeck: (deckId: string) => void
}) {
  const decks = useLiveQuery(() => db.deck.orderBy('order').toArray(), []) ?? []
  const cards = useLiveQuery(() => db.card.toArray(), []) ?? []
  const deckName = (id: string) => decks.find((d) => d.id === id)?.name ?? ''

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      label="명령 팔레트"
      contentClassName="cmdk-root"
    >
      <Command.Input placeholder="덱 이동 · 카드 검색 · 명령…" autoFocus />
      <Command.List>
        <Command.Empty>결과 없음</Command.Empty>

        <Command.Group heading="스터디 시작">
          {decks.map((d) => (
            <Command.Item
              key={d.id}
              value={`study ${d.name}`}
              onSelect={() => {
                onClose()
                void openDeck(d.id)
              }}
            >
              ▶ {d.name}
              <span className="hint">스터디</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="액션">
          <Command.Item
            value="새 덱 만들기 new deck"
            onSelect={() => {
              onClose()
              onNewDeck()
            }}
          >
            ＋ 새 덱 만들기
          </Command.Item>
        </Command.Group>

        <Command.Group heading="카드 검색">
          {cards.map((c) => (
            <Command.Item
              key={c.id}
              value={`${c.front} ${c.back} ${deckName(c.deckId)}`}
              onSelect={() => {
                onClose()
                onEditDeck(c.deckId)
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.front}
              </span>
              <span className="hint">{deckName(c.deckId)}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
