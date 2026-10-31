# 🛠️ 거대 파일 리팩토링 가이드 (AI Agent용)

이 문서는 AI Agent가 이 프로젝트에서 대규모 파일 리팩토링을 진행할 때 반드시 지켜야 할 보수적이고 단계적인 방법론을 정의합니다.

---

## 🔴 절대 원칙 3가지

1. **Zero Regression** — 리팩토링 전/후의 동작은 100% 동일해야 합니다. 기능 추가나 수정은 별도 PR로.
2. **One at a Time** — 한 번에 하나의 논리적 단위만 분리합니다. TSC 검증 통과 후 다음 단계로.
3. **Stop When Uncertain** — 코드 의존성이 복잡하거나 side effect가 예상되면 그냥 두는 것이 최선입니다.

---

## 📋 리팩토링 순서 (검증된 절차)

### Step 1: 대상 파악
- 1000줄 이상의 파일 목록 확인:
  ```powershell
  Get-ChildItem -Recurse -Include "*.tsx","*.ts" | Where-Object { $_.FullName -notlike "*node_modules*" } | Select-Object FullName, @{N='L';E={(Get-Content $_.FullName).Count}} | Sort-Object -Property L -Descending | Select-Object -First 10
  ```
- `REFACTORING_TREASURE_MAP.md` 참조하여 이미 계획된 항목 확인

### Step 2: 분리 가능 후보 선정 (보수적 기준)

**✅ 안전하게 분리 가능한 것:**
- 순수 계산 로직 (`useMemo`로 감쌀 수 있는 것)
- 독립 비즈니스 훅 (외부 DOM 이벤트 없는 것)
- 인라인 컴포넌트 (`interface`와 `return <JSX>` 한 묶음)
- 유틸리티 함수 (`stringToColor`, `formatDuration` 등)
- 이미 외부 모듈에 이전된 함수의 잔여 데드코드

**❌ 손대지 말아야 할 것:**
- `passive: false` 이벤트 리스너 (Ctrl+Wheel 같은 것은 DOM context 유지)
- 복잡한 ref + async 조합 로직
- 상태 공유 범위가 불명확한 것
- 단순히 라인 수 줄이기 위한 무분별한 분리

### Step 3: 분리 실행 패턴

> **Custom Hook 추출 (React 컴포넌트 비즈니스 로직)**
```typescript
// hooks/useXxxYyy.ts 생성
export function useXxxYyy({ param1, param2 }: UseXxxYyyParams) {
    // 기존 코드 그대로 이식 (변형 금지)
    return { result1, result2 };
}

// 컴포넌트에서:
import { useXxxYyy } from '../hooks/useXxxYyy';
const { result1, result2 } = useXxxYyy({ param1, param2 });
```

> **Worker 모듈 추출 (Web Worker 내부 함수)**
```typescript
// workers/workerXxx.ts 생성
export interface XxxContext { filteredIndices: ...; ... }
export const handleXxx = async (ctx: XxxContext, ...) => { ... };

// LogProcessor.worker.ts에서:
import * as XxxHandlers from './workerXxx';
case 'XXX': XxxHandlers.handleXxx(getContext(), ...); break;
```

> **유틸리티 함수 추출**
```typescript
// utils/xxxUtils.ts 생성
export function someUtil(...) { ... }

// 원본 파일에서:
import { someUtil } from '../utils/xxxUtils';
```

### Step 4: 검증 (필수)

```powershell
# 1. TypeScript 타입 오류 확인
npx tsc --noEmit

# 2. 줄 수 감소 확인
(Get-Content 'components/LogSession.tsx').Count

# 3. npm run electron:dev로 앱 기동 확인
```

### Step 5: 커밋
- 각 논리적 단위 분리 완료마다 `git a && git c 'refactor: ...' && git p`

---

## 🧰 실전에서 배운 세부 규칙

### Import는 반드시 파일 최상단에
- ES Module 규격상 `import` 구문은 **파일 최상단에만** 위치해야 합니다.
- 코드 중간에 import가 있으면 Vite(번들러)가 오류를 냅니다.
- 스크립트로 코드 이동 시 줄바꿈(`\r\n`)과 import 위치를 반드시 확인하세요.

### Worker 분리 시 postMessage 타입 주의
- `respond` 함수는 `LogWorkerResponse` 타입 인자를 받습니다.
- 신규 모듈로 이전 시 `(response: any) => void` 형태의 콜백으로 주입하여 의존성을 느슨하게 유지하세요.

### 북마크 캐시는 한 곳에서만 관리
- `filteredIndices`가 바뀌면 반드시 `invalidateCache()`를 호출해야 합니다.
- 분리 후에는 `BookmarkManager.invalidateCache()` 호출 누락 여부를 꼭 확인하세요.

### 훅의 useCallback 의존성 배열 유지
- 기존 인라인 `useCallback`을 훅으로 옮길 때 의존성 배열을 그대로 이식합니다.
- 의존성 배열을 비우거나 `[]`로 만들면 stale closure 버그가 생깁니다.

### `useRef`가 JSX에서 사용 중이면 본체에 유지
- `containerRef` 처럼 JSX의 `ref={xxx}`에 쓰이는 ref는 훅 내부로 이전 불가.
- 이벤트 바인딩만 훅으로 이전하고, ref 선언 자체는 컴포넌트 본체에 남깁니다.

---

## 📊 이 프로젝트의 리팩토링 진행 이력

| 원본 파일 | 원본 줄 수 | 현재 줄 수 | 추출된 모듈 |
| :--- | :---: | :---: | :--- |
| `LogSession.tsx` | ~1445 | ~684 | `useLogSessionShortcuts`, `RawContextViewer`, `colorUtils`, `useLogSessionHighlights`, `useLogSessionContextMenus`, `useLogSessionArchive`, `useLogSessionPaneCallbacks`, `useLogSessionEffects` |
| `LogProcessor.worker.ts` | ~1466 | ~549 | `workerAnalysisHandlers`, `workerDataReader`, `workerBookmarkHandlers` |

---

## ✏️ AI Agent에게 보내는 당부

- 형님은 보수적인 리팩토링을 매우 중요하게 생각합니다. 애매하면 하지 마세요.
- 분리 후 반드시 `npx tsc --noEmit` 으로 타입 오류를 검증하세요.
- 기능 테스트는 형님이 직접 확인합니다. Agent는 TSC 통과와 구조적 정확성에 집중하세요.
- 분리할 때 로직을 변형하지 마세요. 완전히 동일한 코드를 옮기는 것입니다.
- 한 번에 너무 많이 하지 마세요. 작은 단위로 끊고, 각 단위마다 TSC 검증 후 다음으로 넘어가세요.
