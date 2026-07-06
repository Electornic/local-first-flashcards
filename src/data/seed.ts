import { db, SRS_INIT, type Card, type Deck } from '../db'

// 예제 덱 — 첫 실행(빈 DB)에만 주입 → 이게 곧 온보딩.
// 모든 카드는 due: now 로 시작해 콜드 스타트 직후 바로 복습 가능.
interface SeedDeck {
  name: string
  description: string
  cards: [front: string, back: string][]
}

const SEED: SeedDeck[] = [
  {
    name: '프론트엔드 CS 용어',
    description: '면접·실무 공통 기초',
    cards: [
      ['Debounce vs Throttle', 'Debounce: 마지막 이벤트 후 n초 뒤 1회. Throttle: n초마다 최대 1회.'],
      ['CSS containment', 'contain 속성으로 레이아웃/페인트 범위를 격리해 리플로우 비용을 국소화.'],
      ['Critical rendering path', 'HTML→DOM, CSS→CSSOM, 합쳐 Render Tree→Layout→Paint→Composite.'],
      ['Reflow vs Repaint', 'Reflow=기하 재계산(비쌈), Repaint=시각 속성만(색 등, 상대적으로 쌈).'],
      ['Event delegation', '부모에 한 번만 리스너를 달고 이벤트 버블링으로 자식 이벤트를 처리.'],
      ['CORS preflight', '비단순 요청 전 OPTIONS로 서버 허용 여부를 먼저 확인하는 사전 요청.'],
      ['Tree shaking', 'ES 모듈 정적 분석으로 미사용 export를 번들에서 제거.'],
      ['Hydration', '서버 렌더된 정적 HTML에 클라이언트 JS가 이벤트/상태를 다시 붙이는 과정.'],
    ],
  },
  {
    name: 'JavaScript 트랩',
    description: '자주 밟는 함정',
    cards: [
      ['typeof null', '"object" — 언어 초기의 유명한 버그, 하위호환 때문에 유지.'],
      ['0.1 + 0.2 === 0.3', 'false — IEEE 754 부동소수점 오차(0.30000000000000004).'],
      ['[] == ![]', 'true — ![]→false→0, []→""→0, 0==0.'],
      ['NaN === NaN', 'false — NaN은 자기 자신과도 다르다. Number.isNaN으로 검사.'],
      ['var 호이스팅', '선언은 끌어올려지고 초기화는 안 됨 → 선언 전 접근 시 undefined.'],
      ['클로저 in 루프(var)', 'var는 함수 스코프라 루프 끝 값 공유. let은 블록 스코프라 매 반복 캡처.'],
      ['this in 화살표 함수', '화살표는 자체 this가 없어 렉시컬(정의 시점 상위 스코프) this를 사용.'],
      ['+[] 결과', '0 — 빈 배열이 ""로, 다시 숫자 0으로 강제 변환.'],
    ],
  },
  {
    name: '브라우저 & 저장소',
    description: '로컬-퍼스트 실전 감각',
    cards: [
      ['IndexedDB eviction', 'best-effort 저장소는 디스크 압박 시 LRU로 삭제됨. persist()로 완화.'],
      ['Safari 7일 ITP', '7일 미방문 시 script-writable 저장소 전체 삭제. PWA 설치 시 면제.'],
      ['Service Worker 역할', '앱 셸(JS/CSS/HTML) 프리캐시 → 오프라인 새로고침에도 앱이 뜨게 함.'],
      ['앱 셸 ≠ 데이터', '데이터가 IndexedDB에 있어도 SW 없으면 오프라인 재방문 시 번들 fetch 실패.'],
      ['storage.persist()', '거부될 수 있고 Safari 7일은 못 막음 → export/import가 실질 방어.'],
      ['복합 인덱스', '[deckId+due] 같은 복합 인덱스로 덱별 due 쿼리를 인덱스만으로 즉시 처리.'],
    ],
  },
]

export async function ensureSeeded(): Promise<void> {
  // 시드 중복 주입 방어 — 빈 DB일 때만.
  const existing = await db.deck.count()
  if (existing > 0) return

  const now = Date.now()
  const decks: Deck[] = []
  const cards: Card[] = []

  SEED.forEach((sd, deckOrder) => {
    const deckId = crypto.randomUUID()
    decks.push({
      id: deckId,
      name: sd.name,
      description: sd.description,
      order: deckOrder,
      createdAt: now,
    })
    sd.cards.forEach(([front, back], cardOrder) => {
      cards.push({
        id: crypto.randomUUID(),
        deckId,
        front,
        back,
        due: now, // 콜드 스타트 직후 바로 due
        order: cardOrder,
        createdAt: now,
        ...SRS_INIT,
      })
    })
  })

  await db.transaction('rw', db.deck, db.card, async () => {
    await db.deck.bulkAdd(decks)
    await db.card.bulkAdd(cards)
  })
}
