---
type: spec
status: draft
created: 2026-07-09
updated: 2026-07-09
tags: [llm, on-device, webllm, webgpu, web-worker, flashcards, spaced-repetition]
---

# 온디바이스 LLM 기능 스펙 — 로컬-퍼스트 플래시카드 (웹 + WebLLM)

**TL;DR** — 이 앱에 온디바이스 LLM 기능 3개를 **리스크 오름차순**으로 얹는다: ⓪ 설명·니모닉(워킹 스켈레톤) → ① 카드 자동 생성(첫 헤드라인) → ② 자유서술 채점(간판). 런타임은 **플레인 웹 + WebLLM(브라우저 WebGPU)을 Web Worker에서** 구동한다 — **Tauri 없음, 기존 PWA는 유지.** opt-in AI 팩(모델 ~2–2.5GB를 브라우저 캐시로 다운로드), XGrammar 구조화 출력, 3–4B 모델(한국어→Qwen 계열). 원칙: **핵심 스터디 루프는 LLM 없이도 100% 동작**, AI는 progressive enhancement.

## 왜 이렇게 (핵심 근거)

- **플레인 웹 + WebLLM이 지금은 가장 깔끔.** 네이티브(Tauri)로 갈 이유였던 "웹뷰 WebGPU 불안"은 **Tauri 시스템 웹뷰 한정** 문제였다. **진짜 브라우저는 WebGPU가 안정** — Chrome/Edge(v113~, 2023), Safari 26(2025 가을, macOS/iOS/iPadOS 기본 on)은 확실. **Firefox만 부분**(Windows·Apple Silicon macOS(26+) 기본 on / Intel mac·Linux 아직) → 그 경로만 degrade. WebLLM으로 서버 0·키 0·(캐시 후)오프라인 추론이 그대로 된다. Tauri를 빼면 Rust·서명·사이드카·CSP가 전부 사라져 제일 단순하다.
- **PWA는 유지한다(제거하지 않음).** WebLLM과 서비스워커는 **직교** — WebGPU+Worker 추론과 앱셸 프리캐시는 충돌하지 않고, WebLLM의 WebGPU 경로는 SharedArrayBuffer를 안 써 **COOP/COEP(cross-origin isolation) 불필요**(→ SW와 마찰 0, 정적 호스팅 OK). 모델(~2GB)은 빌드 산출물이 아니라 런타임에 WebLLM이 Cache/IDB로 받으므로 **workbox 프리캐시 대상이 아니다**(globPatterns 무관). 기존 PWA를 유지하면 **오프라인 완전 동작(콜드 리로드)** 헤드라인과 **iOS 홈화면 설치 → Safari ITP 7일 면제**가 그대로 살아있다. 2GB 모델을 캐시하는 이 앱에선 eviction 방어가 오히려 더 중요해진다.
- **Web Worker 필수.** 추론은 무거워서 메인스레드에서 돌리면 이 앱의 "뒤집기/넘김 16ms" 핫루프가 버벅인다. WebLLM을 **워커**(`CreateWebWorkerMLCEngine`)에서 돌려 UI 스레드를 지킨다.
- **구조화 출력.** "JSON 줘" 프롬프트만으론 소형 모델이 포맷을 자주 깬다. WebLLM의 **`response_format`(XGrammar 백엔드) 강제**로 3–4B도 유효 카드를 보장. 스키마는 flat(중첩·enum 과하면 소형 모델 품질↓).
- **모델 3–4B, 한국어는 Qwen 확정.** 프리빌트 카탈로그는 실질 ~8B가 상한(디바이스 VRAM + WebGPU 버퍼 한계 기반 휴리스틱, 하드리밋 아님)이라 3–4B는 여유. **Llama-3.2-3B는 한국어 공식 미지원, Phi-3.5-mini는 영어 편중** → 멀티링구얼 강한 **Qwen**: `Qwen3-4B-q4f16_1-MLC`(VRAM ~3.4GB) 또는 경량 `Qwen2.5-3B-Instruct-q4f16_1-MLC`(VRAM ~2.5GB). 성능 수치는 고급 GPU best-case, **통합 GPU는 급락** → 저사양 실측 필수.
- **채점은 assistive.** ASAG 연구: LLM 채점은 명확한 정답/오답은 사람과 차이 거의 없지만 **부분정답에서 흔들림**(BMC Med Educ 2024; arXiv:2605.00200). rubric·few-shot로 정확도는 오르지만 **run-to-run 일관성은 오히려 나빠질 수 있고**(arXiv:2502.13337), 편향도 방향성을 가진다(rubric 없으면 관대 / 정답키만 주면 엄격; 일치율 ~70–80%에서 정체). → AI 등급은 권위가 아니라 **제안(override 가능)**, 저신뢰(부분정답)는 자기채점 폴백(confidence-gated deferral, GradeHITL arXiv:2504.05239).

> 관련 서베이는 knowledge-hub `llm/browser-local-llm-for-generative-ui`. 이 문서는 결정 근거를 자체 포함한다.

## 0. 전제 (확정된 결정)
- 플랫폼: **플레인 웹 앱(브라우저). Tauri 없음. 기존 PWA(vite-plugin-pwa)는 유지.**
- ✅ **PWA 유지 → 기존 헤드라인 보존**: 오프라인 완전 동작(콜드 리로드)·iOS "홈 화면에 추가"(ITP 7일 면제)가 그대로. [ROADMAP.md](ROADMAP.md) 문구 **변경 불필요**. 모델은 SW 프리캐시 대상이 아니므로(런타임 다운로드) workbox 설정도 손댈 필요 없음.
- 추론: **WebLLM(WebGPU) + Web Worker**. WebGPU 미지원(예: Firefox Intel mac/Linux) → AI 기능 degrade(숨김), 나머지 앱 정상.
- 배포: **정적 호스팅으로 충분**(HTTPS만 필요, COOP/COEP·`crossOriginIsolated` 불필요). ⚠️ 단 모델 가중치·`model_lib`(.wasm)는 기본적으로 **서드파티 CDN(HuggingFace/mlc.ai)에서 최초 fetch** → 완전 self-contained(server 0)를 원하면 자가 호스팅 필요(§1).
- 기존 스택(Vite+React+TS, Dexie, motion/dnd-kit/cmdk) 유지. Rust/네이티브/사이드카 **없음**.

## 1. 공통 아키텍처
- **WebLLM 엔진**: `CreateWebWorkerMLCEngine`로 **Web Worker**에서 구동(메인스레드 비차단 → 16ms 보존; 워커측 핸들러 `WebWorkerMLCEngineHandler`). 엔진은 앱 생애 1회 init 후 재사용.
  - ⚠️ **콜드 로드 지연**: 첫 요청 전 모델을 GPU로 로드하는 데 수 초 걸림 → **"모델 로딩 중" 상태 UI 필수**(스트리밍 시작 전 공백 방지).
  - ⚠️ **WebGPU feature detection**: `navigator.gpu` 없으면 AI 비활성. 통합 GPU/저사양은 처리량 급락 → 개발 맥북 수치 믿지 말고 **저사양 실측**.
  - ⚠️ **StrictMode 이중 마운트**: [main.tsx:19](src/main.tsx:19)가 `<StrictMode>` → 엔진 init을 `useEffect`에 두면 dev에서 2GB 로드가 **두 번** 킥오프. **모듈 싱글턴/ref로 init 가드**(생애 1회 강제).
- **opt-in AI 팩**: 모델은 자동 다운로드 X("AI 켜기" 시 다운로드 → **브라우저 캐시(IndexedDB/Cache)**, 진행률 콜백 노출, 이후 오프라인). 크기 = **다운로드 ~2GB(3B)·~2.2–2.5GB(4B)**, VRAM은 별개(3B ~2.5GB·4B ~3.4GB).
  - ⚠️ **캐시 eviction**: script-writable 저장소라 브라우저가 날릴 수 있음(특히 **Safari 7일 ITP** — script 생성 데이터 전체 삭제). **방어는 이미 앱에 있음**: `requestPersistence()`([db.ts:66](src/db.ts:66))가 부팅 시 호출됨([main.tsx:14](src/main.tsx:14)). 단 Safari 탭에선 `persist()`가 휴리스틱이라 미보장 → **iOS는 홈화면 설치(PWA)가 확실한 면제책**. 모델은 날아가면 재다운로드가 유일(export 대상 아님); 사용자 데이터는 기존 export/import가 방어.
  - ⚠️ **모바일 저장소 쿼터**: iOS/저사양 안드로이드는 2GB 모델 다운로드·캐시가 실패할 수 있음 → **소형 티어(1.5–1.7B) 폴백** + 다운로드 실패 시 degrade. (처리량뿐 아니라 **다운로드 가능성**도 저사양·모바일에서 실측.)
  - ⚠️ **런타임 OOM ≠ 다운로드 실패**: 다운로드 성공해도 iOS Safari 등 저VRAM에서 3–4B가 **로드/추론 중 OOM** 가능 → 다운로드 가드와 별개로 **load-time try/catch + 소형 폴백**(별도 축).
  - ⚠️ **`model_lib`(.wasm)도 외부 fetch**: 가중치(~2GB)뿐 아니라 모델별 `model_lib`(.wasm, 수 MB)도 기본 **서드파티 CDN**에서 최초 다운로드(이후 캐시). "server 0·오프라인" 헤드라인을 문자 그대로 지키려면 `appConfig`로 **가중치+wasm 자가 호스팅** 고려.
- **모델**: MLC prebuilt — 한국어 1픽 `Qwen3-4B-q4f16_1-MLC`, 경량 `Qwen2.5-3B-Instruct-q4f16_1-MLC`, **모바일용 소형 `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` / `Qwen3-1.7B-q4f16_1-MLC`**(멀티링구얼). (⚠️ Qwen3는 `-Instruct` 없음, Qwen2.5는 있음 — `model_id` 오타 주의.)
- **구조화 출력**: WebLLM `response_format` = **`{ type: "json_object", schema: JSON.stringify(schema) }`** (schema는 **문자열화 필수**, XGrammar 백엔드). ⚠️ 최상위를 배열로 두기보다 `{ cards: [{front, back}] }`로 **객체 래핑**하는 게 `json_object` 시맨틱·소형모델 안정성에 유리. flat 스키마 + 프롬프트에도 구조 설명 병행. (문법 모드는 `{ type: "grammar", grammar: "<EBNF>" }`.)
- **스트리밍**: WebLLM은 OpenAI 호환 — `await engine.chat.completions.create({stream:true})` 후 `for await`로 청크 수신 → UI 갱신. (토큰 usage 필요 시 `stream_options:{include_usage:true}`.)
- **취소**: 카드 이탈/다음 카드 전환 시 진행 중 생성 중단 — `engine.interruptGenerate()`. ⚠️ **fire-and-forget(`void`)·엔진 전역**(per-request AbortController 아님): 신호 후 진행 중 `create(...)`가 반환됨. **동시 생성 없음을 불변식으로 강제** — store에 **single-flight 락**을 두고, 새 생성 전 `interruptGenerate()` **완료를 await**(interrupt 직후 즉시 `create()`는 레이스). 기능 ⓪ 스트리밍과 ② 채점이 겹칠 수 있으므로 주석이 아니라 코드로 보장.
- **상태/영속**: AI UI 상태 = zustand([store.ts](src/store.ts)). 토스트는 `useStore(s=>s.pushToast)`(tone `'error'|'info'`). 결과 영속 = Dexie([db.ts](src/db.ts)).
  - ✅ **AI 메타 저장에 스키마 마이그레이션 불필요**: Dexie 스키마 문자열은 PK·인덱스만 선언하고 `put()`은 객체 전체를 저장 → `reviewLog`에 `aiRating`/`reason` 같은 **비인덱스 필드는 `db.version(2)` 없이 그냥 저장됨**. [db.ts:27](src/db.ts:27) `ReviewLog` 타입 + [store.ts:98](src/store.ts:98) writer(`persistReview`)만 확장. (`version(2)`는 그 필드를 **인덱싱**하거나 기존 행을 마이그레이션할 때만.)
- **degrade**: WebGPU 없음/모델 미다운로드 → AI 버튼 비활성, 나머지 앱 정상.

## 2. 기능 ⓪ — 설명·니모닉 (워킹 스켈레톤)
- **목적**: 배선 전체(Worker↔WebLLM 엔진↔**스트리밍**↔UI)를 최소 코드로 증명 + 실사용.
- **UX**: 카드 뒤집어 뒷면 확인 후 "🧠 더 설명/니모닉" → 패널에 토큰 스트리밍.
- **I/O**: in = 카드 front+back(기존 데이터). out = 자유 텍스트(스키마 X).
- **터치포인트**: [StudyView.tsx](src/components/StudyView.tsx). 워커 엔진 호출 + 스트리밍 수신. 실패 토스트 = `useStore(s=>s.pushToast)`.
- **완료 기준**: 버튼 → 로컬 스트리밍 응답 → (모델 캐시 후) 오프라인 동작. (이 배선이 ①②에 그대로 재사용)

## 3. 기능 ① — 카드 자동 생성 (첫 헤드라인)
- **목적**: 빈 덱 문제 해결 = 온보딩 킬러. `seed`의 AI 버전.
- **UX**: [App.tsx:44](src/App.tsx:44)의 `newDeck()` or [CardEditor.tsx](src/components/CardEditor.tsx)에 "AI로 채우기" → 텍스트 붙여넣기 → N개 카드 **미리보기**(취사·편집) → 저장.
- **구조화 출력**: `response_format:{type:"json_object", schema: JSON.stringify(...)}`로 **`{ cards: [{front, back}...] }`** 강제(flat, 배열은 객체로 래핑).
- **⚠ 카드 shape는 seed/CardEditor를 그대로 미러링**: 생성 카드도 **`{ id, deckId, front, back, due: now, order, createdAt, ...SRS_INIT }`** 전부 세팅. `SRS_INIT`(=`{interval:0, ease:2.5, reps:0, lapses:0}`, [db.ts:37](src/db.ts:37))에는 **`due`가 없다** → `due: now` 별도, `order`·`createdAt`도 필수. (기존 예시: [CardEditor.tsx:36](src/components/CardEditor.tsx:36) `submitCard()`가 정확히 이 shape.)
- **⚠ 쓰기 경로**: [seed.ts:86](src/data/seed.ts:86)처럼 **트랜잭션 안에서 `card.bulkAdd`**(N개 배치). (`bulkAdd`는 seed 패턴, [db.ts](src/db.ts)의 `importBackup`은 `bulkPut` — 파일 혼동 말 것.) CardEditor 카드 리스트는 `useLiveQuery`라 삽입 후 자동 갱신.
- **완료 기준**: 텍스트 → 유효 카드 N개 생성·미리보기·저장, 전부 (캐시 후)오프라인.
- **함정**: 소형 모델 품질 편차 → 미리보기 편집/삭제(생성=제안), 중복·빈 카드 필터.

## 4. 기능 ② — 자유서술 채점 (간판)
- **목적**: 자기채점 SRS를 의미 기반 채점으로 업그레이드. "로컬 AI" 쇼케이스.
- **UX**: [StudyView.tsx:113](src/components/StudyView.tsx:113)의 `grade-row`(4버튼, `RATINGS`)에 **텍스트 입력 모드** 추가. 답 타이핑 → LLM이 뒷면과 의미 비교 → 제안 등급.
- **⚠ 통합 seam = `store.grade(rating)` (핵심, `schedule()` 아님)**: 낙관적 advance·**Again 세션 재삽입(`AGAIN_GAP=5`)**·`reviewLog` write·streak 갱신이 전부 [store.ts:164](src/store.ts:164) `grade()`에 있음. AI 판정은 반드시 `grade(rating)`로 흘려야 이 로직이 공짜로 성립. `schedule(c, rating, now?)`([lib/srs.ts:10](src/lib/srs.ts:10))를 직접 부르면 우회됨.
- **⚠ 비동기 AI vs index 결합 (설계 필요)**: `grade()`는 `session.queue[session.index]`(현재 카드)를 채점. AI 제안이 늦으면 사용자가 이미 넘어가 index 이동 → 대상 소실. **타깃 채점 경로**(`grade(rating, cardId)`, 현재 시그니처엔 `rating`만) L4에서 추가. ⚠️ **card-id만으론 부족** — [store.ts:179](src/store.ts:179)의 Again 재삽입(`updated={...card}`)으로 **같은 `card.id`가 `AGAIN_GAP=5`장 뒤 다시 등장**하므로, 대상은 **advance마다 증가하는 monotonic 방문 토큰**(또는 요청 시점 index 스냅샷)으로 고정해야 함(같은 카드의 이전/이후 방문 구분).
- **⚠ 이중 채점 가드 (correctness — 반드시)**: 사용자가 AI를 기다리다 포기하고 **수동 채점→advance** 하면, 늦게 온 AI 결과가 이미 채점된 카드에 또 `grade()`를 호출 → `reviewLog` 두 행 + SM-2 **이중 적용**으로 스케줄 오염. → **수동 채점 즉시 `interruptGenerate()`** + **방문 토큰 가드**: 늦게 온 AI 결과의 토큰이 현재 방문 토큰과 다르면 **무시**(위 타깃 채점과 동일 토큰 재사용). 🔴 **card-id 기준 "이미 채점됨" 가드는 금지** — Again 재복습(같은 card.id)을 오차단함.
- **품질**: rubric + few-shot으로 부분정답 보정. ⚠️ few-shot은 정확도↑지만 **run-to-run 일관성은 나빠질 수 있음** → 온도↓·예시셋 고정. `response_format`으로 `{rating, reason}` 강제. AI 등급은 **제안**이고 저신뢰(부분정답)는 자기채점 폴백.
- **⚠ AI 등급 granularity는 SM-2 Hard 분리 이후에야 의미**: [srs.ts:17](src/lib/srs.ts:17) TODO대로 지금은 Hard(1)가 Good(2)과 **같은 interval**. AI가 "부분정답→Hard"로 매핑해도 스케줄상 Good과 동일 → 미세 판정 무의미. 기능 ②의 등급 세분화는 **Hard interval 분리(예: ×1.2)에 의존**.
- **영속**: `reason`/`aiRating`은 `reviewLog`에 **비인덱스 필드로 추가**(§1 — 마이그레이션 불필요, `ReviewLog` 타입 + `persistReview` 확장).
- **완료 기준**: 답 입력 → AI 등급 제안 → 사용자 확정/override → `grade()` 통해 SM-2 반영, 루프 즉각성 유지.
- **함정**: 부분정답 흔들림 → 강제 등급 금지, 항상 override + 자기채점 폴백. 채점 중 이탈/**수동 채점** 시 즉시 `interruptGenerate()`(이중 채점 가드).

## 5. 빌드 순서 (마일스톤)
- **L0 — WebLLM 배선**: WebLLM **워커 엔진** init(`CreateWebWorkerMLCEngine`) + **WebGPU feature detection**(`navigator.gpu`) + 스트리밍 왕복(하드코딩 프롬프트). (PWA·Rust/Tauri 안 건드림 → 가장 가벼운 시작.) 엔진은 **모듈 싱글턴 + single-flight 락**으로 배선(StrictMode 이중 init 방지).
- **L1** opt-in 모델 다운로더(진행률 + degrade 경로). `requestPersistence()`는 이미 있음(재사용).
- **L2** 기능 ⓪ 스트리밍 UI + 콜드 로드 상태.
- **L3** 기능 ① 카드 생성(`response_format` json_object+schema + seed shape 미러 + `bulkAdd` 트랜잭션 + 미리보기).
- **L4** 기능 ② 채점(`grade()` 경유 + **방문 토큰 타깃** + 이중 채점 가드 + `ReviewLog` 필드 확장 + rubric/few-shot).
- **L5** 모델 선택 UI(**모바일 소형 티어 포함**) + **저사양·모바일 다운로드 실측** + **AI 품질 eval 하네스** + 프롬프트 튜닝.

## 6. 미리 막을 함정 (공통)
- **WebGPU feature detection + degrade** 먼저. 통합 GPU/저사양 처리량 급락 → 저사양 실측. (Firefox Intel mac/Linux 등 미지원 경로 + **모바일 저장소 쿼터로 대형 모델 다운로드 실패** 시 degrade/소형 폴백.)
- 추론은 **Web Worker**(메인스레드 비차단). 첫 요청 전 **콜드 로드(수 초) 로딩 UI**. 엔진 init은 **모듈 싱글턴**(StrictMode dev 이중 마운트 → 2GB 이중 로드 방지).
- 모델 캐시 **eviction(Safari ITP)** → `requestPersistence()`(기존) + iOS는 홈화면 설치 유도 + 모델 재다운로드 감안(모델은 export 대상 아님).
- 진행 중 생성 **취소**: `interruptGenerate()`(fire-and-forget·엔진 전역) + **single-flight 락**(새 생성 전 interrupt await; 동시 생성 금지 불변식).
- `response_format`은 **`{type:"json_object", schema: JSON.stringify(...)}`** — **OpenAI식 `json_schema` 타입은 WebLLM에 없음.** 배열은 객체로 래핑.
- 채점은 **`store.grade()` 경유**(schedule 직접 호출 금지), **방문 토큰 타깃**(card-id 가드 금지 — Again 재복습 오차단). AI 메타는 비인덱스라 **마이그레이션 불필요**.
- 카드 생성은 **seed/CardEditor shape 전체**(due·order·createdAt) 미러.
- 생성/채점은 제안(편집·override). 핵심 루프는 AI 없이도 완전 동작.
- **PWA 유지** → 오프라인 완전 동작·iOS ITP 면제 그대로(ROADMAP 변경 없음). 모델은 workbox 프리캐시 대상 아님. (⚠️ 가중치·`model_lib`.wasm은 최초 서드파티 CDN fetch — 완전 server-0 원하면 자가 호스팅.)

## 7. 열린 질문 (결정 필요)
- ✅ **모델 픽 확정**: 한국어 → `Qwen3-4B-q4f16_1-MLC`(최고품질) / `Qwen2.5-3B-Instruct-q4f16_1-MLC`(경량). Llama-3.2·Phi-3.5는 한국어 약해 제외.
- ✅ **구조화/취소 API 확정**: `response_format {type:"json_object", schema}`(문자열화) + `interruptGenerate()` (§1).
- ✅ **배포 요건 확정**: 정적 호스팅 + HTTPS면 충분(COOP/COEP 불필요). 남은 건 도메인/호스트 선택뿐.
- ✅ **이중 채점 가드 형태 확정**: **방문 토큰**(advance monotonic) 기준 — card-id 가드는 Again 재복습 오차단이라 금지(§4). 남은 결정: 채점 UX(항상 텍스트 입력 vs 토글)·`grade(rating, cardId)` 최종 시그니처.
- **AI 품질 eval 하네스** 설계(카드/채점 품질 계측 — 이 앱의 `FpsOverlay` 계측 문화 연장).
- rubric 문구·few-shot 예시셋 큐레이션(일관성 caveat 감안 — 온도↓·예시 고정).
