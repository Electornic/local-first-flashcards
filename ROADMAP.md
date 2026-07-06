---
type: concept
tags: [frontend, local-first, indexeddb, motion, spaced-repetition, offline-first, demo-spec, prototype]
created: 2026-07-06
publish: true
---

# 로컬-퍼스트 플래시카드 앱 스펙 (Vite+React+IndexedDB)

**TL;DR** — 서버·로그인 없이 **브라우저(IndexedDB)가 데이터의 원천**인 간격반복(SRS) 암기 앱. 증명하려는 느낌은 **"스터디 루프(뒤집기 → 채점 → 다음 카드)가 오프라인에서도 종이처럼 즉각·부드럽다"** 하나. 애니메이션 어휘는 [[instant-smooth-ui-demo-spec]]를 그대로 계승하고, 여기서만 나오는 **카드 뒤집기**를 추가한다.

왜 중요한가: [[instant-smooth-ui-demo-spec]]는 **가짜 API(`fakeApi`)로 지연을 시뮬**해서 "그래도 즉각 반응"을 증명했다. 로컬-퍼스트는 그 명제를 **진짜로** 만든다 — 느려질 서버가 아예 없다. 동시에 IndexedDB의 실전 감각(인덱스 쿼리 / 영속성 / eviction 방어)을 손에 익히는 레퍼런스.

## 목표 & 합격 기준 (측정 가능하게)
- 입력 피드백 **<100ms** (뒤집기 / 채점 / hover)
- 스터디 루프(뒤집기 + 카드 넘김) 중 **프레임 16ms 유지** (rAF 오버레이 녹색)
- **오프라인 완전 동작** — 네트워크 끊고 **새로고침/재방문 후에도** 앱 셸 로드 + 덱 열기·복습·채점·카드 생성 전부 됨 (→ 서비스 워커 프리캐시 필수, M0)
- **콜드 스타트** — 빈 DB → 시드 자동 주입 → 바로 스터디 가능
- **"오늘 복습할 카드"** 쿼리가 카드 수천 장에서 즉시 (덱별 = `[deckId+due]` 복합 인덱스 / 전역 = `due` 인덱스)

## 콘셉트 & 데이터
- **IndexedDB(Dexie)가 원천.** 서버는 없음. 나중에 sync는 옵션.
- 시드: 예제 덱 2~3개(프론트 CS 용어 / JS 트랩 등), 첫 실행(빈 DB)에만 `bulkAdd` → **이게 곧 온보딩**.

```ts
// Dexie 스키마 (버전 1)
deck      : '&id, order'
card      : '&id, deckId, due, order, [deckId+due]'   // ★ due = 킬러 인덱스, [deckId+due] = 덱별 due
reviewLog : '&id, cardId, reviewedAt'      // append-only

// card SRS 상태 (신규/시드 초기값 필수): { front, back, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 }
//   ↑ 초기값 없으면 schedule()에서 NaN. 시드 로더/카드 생성 시 반드시 세팅.
// 킬러 쿼리 (전역 오늘 복습): db.card.where('due').below(Date.now()).toArray()
// ★ 덱별 due (스터디 진입/뱃지 = 실사용 경로): 스터디는 덱 단위로 들어가고 뱃지도 덱별이라
//   전역 쿼리로는 부족. 복합 인덱스 [deckId+due]로 인덱스만으로 즉시:
//   db.card.where('[deckId+due]').between([deckId, 0], [deckId, Date.now()]).toArray()
// 반응형 UI (뱃지/덱리스트 전용): useLiveQuery(() => db.card.where('[deckId+due]').between([deckId,0],[deckId,nowTick]).toArray(), [deckId, nowTick])
```

**⚠ useLiveQuery의 두 함정 (라이브러리 처음 쓸 때 반드시 밟음)**
1. **시간 경과에 반응 안 함** — `useLiveQuery`는 **DB 쓰기**에만 재실행된다. `now`를 클로저에 고정하면, write 없이 시간만 지나서 `due`가 된 카드는 뱃지/큐에 안 잡힌다. → 30~60s `setInterval`로 갱신하는 `nowTick` 상태를 만들어 쿼리 deps에 넣는다.
2. **활성 세션 큐 ≠ live query** — 진행 중인 스터디 세션 목록을 live query로 두면, 채점 write가 방금 그 카드를 목록에서 빼거나 재정렬하면서 `AnimatePresence` exit/enter와 충돌한다. → **역할 분리: 뱃지·덱리스트 = useLiveQuery / 진행 중 세션 큐 = 세션 시작 시 zustand 스냅샷.**

## 화면 (3~4개)
1. **덱 리스트** (Grid) — 덱 카드, hover/press, "오늘 due N장" 뱃지, 드래그 재정렬.
2. **스터디 뷰** — 카드 뒤집기(rotateY) + 채점 4버튼 + 진행 링 + 카드 넘김(AnimatePresence).
3. **카드/덱 편집** — CRUD.
4. **⌘K 팔레트** — 덱 이동 / 스터디 시작 / 카드 생성 / 검색.

## 인터랙션 스펙 (기법 + "느낌" 기준 + 시작 파라미터)

**① 덱 → 스터디 모핑**
- `startViewTransition(() => flushSync(() => setRoute('study')))` + 덱카드/첫카드에 동일 `view-transition-name: deck-{id}`
  - ⚠ `startViewTransition(cb)`은 `cb` 안에서 **DOM이 동기적으로** 바뀌길 기대한다. React setState는 비동기 배칭이라 `flushSync` 없이는 캡처가 전환 전 DOM으로 찍혀 모핑이 안 먹는다.
  - ⚠ 폴백: View Transitions 미지원(구 Safari <16.4 / 일부 Firefox 경로)에서는 `useViewTransition.ts` 래퍼가 그냥 `setRoute` 직접 호출로 떨어지게 한다.
- CSS: `::view-transition-old/new(deck-*)` **300ms, `cubic-bezier(.2,.8,.2,1)`** ([[instant-smooth-ui-demo-spec]]와 동일 파라미터)
- 느낌: 덱이 그 자리에서 자라 첫 카드가 됨. 흰 깜빡임 0.

**② 카드 뒤집기 (여기서만 나오는 시그니처)**
- 컨테이너 `perspective: 1000px`, 회전 wrapper `transform-style: preserve-3d`(**전 브라우저 필수** — Safari만 아님), 앞/뒤 면 `backface-visibility: hidden`, 뒷면 `rotateY(180deg)` 프리셋
- Motion: `animate={{ rotateY: flipped ? 180 : 0 }}` spring **`{ stiffness: 260, damping: 24 }`**
- 느낌: 종이처럼 팍 뒤집히고 살짝 정착.

**③ 채점 → 즉시 다음 카드 (핵심 루프)**
- 클릭 즉시 SM-2로 다음 `due` 계산 → **즉시 다음 카드로 전환** → IndexedDB write는 백그라운드
- `AnimatePresence`: 현재 카드 위로 스와이프+페이드 `exit`, 다음 카드 아래서 올라오는 `initial`
- 느낌: 채점하면 카드가 손에서 넘어가고 다음 장이 바로 올라옴. 지연 0.

**④ 틀림(Again) 피드백**
- 카드 흔들림 `x: [0,-7,7,-5,5,0]` ([[instant-smooth-ui-demo-spec]] 롤백 흔들림 재사용)

**⑤ 스트릭/완료 카운트 pop**
- `scale: [1, 1.4, 1]` (하트 pop 재사용) — 세션 완료 카드 수 / 연속일 갱신 시.

**⑥ 덱·카드 재정렬** — dnd-kit `rectSortingStrategy`, 리프트 = scale 1.03 + shadow (Motion `Reorder`는 2D에서 순서 점프 → dnd-kit로).

**⑦ ⌘K** — cmdk 퍼지 검색. 이동 시 ①과 동일 VT. 개념 배경 [[jarvis-style-command-layer-ui]].

## 🔑 스터디 루프 (앱의 심장)
```
1. 덱별 due 큐 뽑기   db.card.where('[deckId+due]').between([deckId,0],[deckId,now])  (복합 인덱스, 즉시)
                     → 세션 시작 시 zustand 스냅샷으로 고정(진행 중 live query 금지, 라인 39)
2. 앞면 → 뒤집기(②)
3. 채점 Again/Hard/Good/Easy → SM-2로 next due 계산
4. 즉시 다음 카드 전환(③) + reviewLog append + card update (백그라운드 write)
   ★ Again(0)이면 인메모리 세션 큐에 해당 카드 재삽입(예: N장 뒤). 스냅샷은 얼어 있으므로
     이 재삽입이 없으면 due=now+60s만 찍히고 이번 세션에서 다시 안 나온다 = 학습단계 붕괴.
```
```ts
// 최소 SM-2 (시작 파라미터, 이후 튜닝)
// rating: 0=Again 1=Hard 2=Good 3=Easy
// 전제: 카드는 { interval:0, ease:2.5, reps:0, lapses:0 }로 초기화돼 있어야 함(위 스키마 주석)
function schedule(c, rating) {
  if (rating === 0)                                   // Again → 학습단계 리셋
    return { ...c, reps: 0, lapses: c.lapses + 1, interval: 0,
             due: Date.now() + 60_000 }               // 1분 뒤
  // clamp는 lib/srs.ts 헬퍼: const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const ease = clamp(c.ease + (0.1 - (3 - rating) * 0.08), 1.3, 3.0)  // 상한 3.0은 의도적 절제(표준 SM-2는 무상한, 2.5 시작)
  const days = c.reps === 0 ? 1 : c.reps === 1 ? 6 : Math.round(c.interval * ease)
  // ⚠ 튜닝 TODO: 지금은 Hard(1)도 Good과 같은 interval*ease로 크게 늘어난다.
  //    표준적으로 Hard는 더 짧은 배수(예: interval*1.2)를 쓴다 — 이후 분리.
  return { ...c, reps: c.reps + 1, ease, interval: days,
           due: Date.now() + days * 86_400_000 }
}
```
[[instant-smooth-ui-demo-spec]]의 "심장 = 레이턴시 토글"에 대응. 여기선 **로컬이라 항상 즉시** — 그게 로컬-퍼스트의 결론.

## 영속성 함정 (IndexedDB, 이 앱의 진짜 난이도)
- **⭐ 앱 셸 오프라인 ≠ 데이터 오프라인** — IndexedDB 데이터가 남아 있어도, 서비스 워커가 없으면 오프라인 **새로고침/재방문** 시 JS 번들 fetch에 실패해 앱 자체가 안 뜬다. "오프라인 완전 동작"의 절반(앱 셸)은 SW 프리캐시가, 나머지 절반(데이터)은 IndexedDB가 담당한다. **둘 다 있어야 헤드라인 기준 통과.**
- **TTL 없음** — 자동 만료 기능 없음. 필요하면 `savedAt` 찍어 직접 관리 (여기선 카드가 원천이라 만료 안 함).
- **eviction** — 기본 저장소는 best-effort. 디스크 압박 시 브라우저가 LRU로 날림 → 앱 진입 시 `navigator.storage.persist()` 요청.
- **Safari 7일 ITP** — 7일(Safari 사용일 기준) 미방문 시 script-writable 저장소 **전체 삭제**. `persist()`로도 못 막음 → **JSON export/import(백업·기기이동) 필수**. 상세 [[ios-safari-mobile-web-gotchas]].
  - **단, 홈 화면에 설치한 PWA는 면제** — 런처가 Safari와 별도 카운터를 가져 7일 tally가 안 쌓인다. M0의 SW와 결합해 **"홈 화면에 추가" 유도**가 iOS에서 실질적 데이터 보존책. (웹 탭 컨텍스트는 여전히 못 막음 → export 병행)
- 결론: 원천이 로컬이라도 **백업 경로(export)는 1급 기능**. "영구보존" 가정 금지.

## 측정 오버레이
- [[instant-smooth-ui-demo-spec]]의 `FpsOverlay` 그대로 이식 — 뒤집기 + 카드 넘김이 16ms 유지되는지.
- 검증은 **CPU 4x 스로틀 + 중저사양** 기준 (개발기 수치 함정).

## 스택 & 파일 구조 (Vite+React+TS)
- [[instant-smooth-ui-demo-spec]]와 **동일 스택** + `dexie` / `dexie-react-hooks` 추가. 서버·라우터 라이브러리 X (route는 zustand).
```
src/
  db.ts                       # Dexie 스키마 + persist() 요청 + export/import
  data/seed.ts                # 예제 덱, 빈 DB에만 주입
  lib/srs.ts                  # SM-2 schedule()
  lib/useViewTransition.ts    # startViewTransition 래퍼(폴백)
  store.ts                    # zustand: route / 스터디 세션 상태
  components/
    DeckGrid.tsx / DeckCard.tsx
    StudyView.tsx / Flashcard.tsx   # 뒤집기 + AnimatePresence 넘김
    CardEditor.tsx
    CommandPalette.tsx
    FpsOverlay.tsx
  App.tsx
```

## 빌드 순서 (진척 체감되게)
- **M0** 셋업 + `db.ts` 스키마 + 시드 로더 + 다크 팔레트 이식 + **PWA 설정**(`vite-plugin-pwa`): 서비스 워커 앱 셸 프리캐시 **+ web app manifest(아이콘·`display:standalone`)** ← 진짜 오프라인의 전제이자 iOS "홈 화면에 추가"(ITP 7일 면제)의 전제
- **M1** 덱 리스트 + hover/press spring + FpsOverlay
- **M2** 덱→스터디 VT 모핑 + **카드 뒤집기** ← 첫 "와"
- **M3 ★핵심** 스터디 루프: 뒤집기 → 채점 → SM-2 → 즉시 다음 카드(AnimatePresence). **오프라인 검증 = 네트워크 끊고 새로고침 후에도 앱이 뜨고 루프가 도는지**(M0의 SW에 의존).
- **M4** "오늘 복습" 큐(덱별 `[deckId+due]` 복합 인덱스, 세션 스냅샷 + Again 재삽입) + 뱃지 `nowTick` 갱신 + 진행 링/카운트 pop
- **M5** 카드/덱 CRUD + dnd-kit 재정렬 + ⌘K
- **M6** `persist()` + JSON export/import + `prefers-reduced-motion` + CPU 스로틀 검증

## 미리 막을 함정
- **뒤집기 backface** — wrapper `transform-style: preserve-3d`(전 브라우저) + 앞/뒷면 `backface-visibility: hidden` + 뒷면 `rotateY(180deg)` 기본 회전 필수. Safari는 추가로 `-webkit-backface-visibility` 프리픽스 확인.
- **역할 분리** — 화면전환=View Transition, 카드 넘김=AnimatePresence, 재정렬=dnd-kit. 섞으면 layout 애니 충돌 ([[instant-smooth-ui-demo-spec]] 함정 계승).
- **낙관적 advance vs write 실패** — UI는 이미 다음 카드로 넘어감. write 실패 시 토스트 + 재시도(카드 상태는 재계산 가능).
- **`reviewLog` 멱등성 보장** — "idempotent"라 하려면 재시도가 중복 append를 안 만들어야 한다. write **전에** `id = crypto.randomUUID()`를 확정하고, 재시도 시 **동일 id 재사용**(`put`/upsert) → 두 번 써도 한 행. id를 매 시도 새로 만들면 중복된다.
- **시드 중복 주입** — 빈 DB일 때만. 버전/플래그로 가드.
- **`persist()` 거부 가능** — 승인 안 될 수 있고 Safari 7일은 못 막음 → export 유도가 실질 방어.
- **spring 너무 통통** — damping 높여 절제 (차분한 톤 유지).
