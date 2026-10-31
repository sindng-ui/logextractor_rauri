# HappyTool Supported Log Formats

이 문서는 HappyTool이 인식하고 파싱할 수 있는 로그 형식의 예시를 정의합니다.
새로운 로그 형식이 추가되거나 수정될 때 이 문서를 참조하여 AI 에이전트가 로직을 일관되게 유지할 수 있도록 합니다.

---

## 📅 타임스탬프 (Timestamp)

로그의 발생 시간을 추출하기 위해 사용되는 패턴입니다. (`utils/logTime.ts` 참조)

### 1. 표준 날짜/시간 (Standard Date/Time)
주로 Android, Tizen 로그에서 사용됩니다.
- **포맷**: `[YYYY-][MM-DD ]HH:mm:ss.mss`
- **예시**:
    - `02-21 11:14:11.123`
    - `2026-02-21 11:14:11.123`
    - `11:14:11.123` (시간만 있는 경우)

### 2. 커널/단조 시간 (Monotonic Time)
부팅 이후 경과 시간을 초 단위로 나타냅니다. 라인 시작 부분에서 인식됩니다.
- **포맷**: `[  Seconds.Microseconds]` (마침표(`.`) 또는 콜론(`:`) 모두 허용)
- **예시**:
    - `[  123.456789]`
    - `[1234:567]` (콜론 구분자)
    - `03.500`, `03:500` (대괄호 없는 경우 포함)

### 3. 특수 포맷 (Special Formats)
- **접두어 기반**: `Service: 123.456`
- **콜론 구분**: `task-123 [001] 100.123: func`
- **고정밀도 추출**: 라인 중간에 소수점 6자리 이상의 숫자가 있는 경우 (예: `Time: 123.456789`)

---

## 🆔 프로세스 및 스레드 식별자 (PID/TID)

성능 분석(Multi-lane) 및 트랜잭션 추적을 위해 사용됩니다. (`components/PerfTool/index.tsx` 및 `utils/transactionAnalysis.ts` 참조)

### 1. 쌍으로 구성된 포맷 (Paired Formats)
- **괄호 쌍**: `(P PID, T TID)` 또는 `(T TID, P PID)` 또는 `(PID, TID)`
    - 구분자 허용: 쉼표(`,`), 콜론(`:`), 공백(` `), 하이픈(`-`) 모두 지원합니다.
    - 예: `(P 9999, T 9995)`, `(9999 9995)`, `(P 9999: T 9995)`
- **대괄호 쌍**: `[PID:TID]` 또는 `[PID TID]` 또는 `[PID-TID]`
    - 예: `[1234:5678]`, `[1234 5678]`, `[1234-5678]`
- **Android 표준**: `Date Time PID TID Level Tag: Message`
    - 예: `02-21 11:14:11.123  1234  5678 I Tag: Message`

### 2. 개별 라벨 (Individual Labels)
다른 패턴이 없을 때 라인 전체에서 검색합니다. (대소문자 무시)
- **PID 라벨**: `P 1234`, `P  333`, `PID: 1234`, `PID 1234`, `ProcessId: 1234`
- **TID 라벨**: `T 5678`, `T  678`,`TID: 5678`, `TID 5678`, `ThreadId: 5678`
- **복합 포맷**: `T1234 P5678`
- **결합 라벨**: `T/P 1234` (TID와 PID가 동일한 경우)

---

## 📂 소스 메타데이터 (Source Metadata)

상세 분석을 위해 로그 본문에서 파일명과 함수명을 추출합니다.

### 1. 표준 소스 위치 포맷
주로 개발용 로그에서 소스 코드의 위치를 명시할 때 사용됩니다.
- **포맷**: `FileName.ext: FunctionName(Line)> Message` 또는 `FileName.ext: FunctionName: Message`
- **예시**:
    - `SmartThingsApp.cs: OnCreate(123)> start`
    - `hwservice.cpp: hwfunc(123)> Initialize`
    - `AppUtil.cs: bind:125> event done`

### 2. 추출 규칙
- **FileName**: 확장자(`.cs`, `.cpp`, `.java` 등)를 포함한 파일 이름.
- **FunctionName**: 파일명 뒤의 콜론(`:`) 이후부터 메시지 시작 구분자(`>` 또는 마지막 `:`) 전까지의 영역. (괄호 안의 라인 번호 포함 가능)

---

## 📑 분석 및 필터링 규칙

### 1. Happy Combo (OR of ANDs)
- 한 줄에 설정된 모든 키워드(AND)가 포함되었는지 확인하며, 그룹 간에는 하나라도 만족(OR)하면 됩니다.

### 2. Family Combo (Hierarchical)
- `[START]`, `[END]`, `[BRANCH]` 등의 키워드를 통해 트랜잭션의 시작과 끝을 연결하여 시각화합니다.

---

## 🤖 AI 코딩 에이전트 개발 가이드 (Development Guide)

이 섹션은 HappyTool의 로그 파싱 기능을 확장하거나 수정할 때 AI 에이전트가 지켜야 할 가이드를 제공합니다.

### 1. 로직 공통화 및 일관성 (Centralization)
- **공통 유틸리티 우선**: 새로운 파싱 로직을 만들기 전에 `utils/logTime.ts` (시간), `utils/transactionAnalysis.ts` (트랜잭션), `components/PerfTool/index.tsx` (PID/TID)의 기존 로직을 최대한 재사용하십시오. 
- **파동 효과(Side Effects)**: 특정 플랫폼의 로그 포맷을 지원하기 위해 정규표현식을 수정할 때, 기존에 잘 작동하던 다른 플랫폼 로그(Android, Tizen 등)가 깨지지 않는지 항상 역행 테스트(Regression Test) 아이디어를 제시하십시오.

### 2. 정규표현식 작성 원칙 (Regex Best Practices)
- **비캡처 그룹 사용**: 성능과 가독성을 위해 불필요한 캡처는 `(?:...)`를 사용하십시오.
- **대소문자 무시 (`i` flag)**: `PID`, `TID`, `ProcessId`, `ThreadId` 등을 찾을 때는 대소문자 구분이 없는 검색을 기본으로 하십시오.
- **유연한 공백 처리**: 로그 생성기에 따라 공백의 개수가 다를 수 있으므로 `\s+` 또는 `\s*`를 적극적으로 활용하십시오.
- **최소 일치 (Lazy mismatching)**: 라인 중간의 데이터를 추출할 때는 다른 데이터와 섞이지 않도록 범위를 좁게 설정하십시오.

### 3. 우선순위 기반 파싱 (Priority-based Parsing)
- 항상 **가장 명시적이고 정보량이 많은 패턴**을 1순위로 두십시오.
  - 예: `(P 123, T 456)` 처럼 쌍으로 된 정보를 먼저 찾고, 없으면 `P 123` 단독 정보를 찾습니다.
- **검색어 연동**: 사용자가 입력한 `targetKeyword`가 PID 숫자 자체일 경우, 이를 파싱 결과보다 우선시하는 로직을 고려하십시오.
- **오탐 방지 (FileName 좌측 스캔 규칙)**: `functionName(223)`이나 로그 본문에 포함된 숫자가 PID, TID, TAG로 오탐(False Positive)되는 것을 완벽히 방지해야 합니다. 따라서 소스 파일명(예: `FileName.cpp:`)을 먼저 찾아내고, **반드시 파일명 기준 좌측 텍스트 영역에서만 탐색**하도록 로직을 구현하십시오.

### 4. 성능 고려 (Performance)
- 로그 분석은 수백만 줄의 루프에서 실행될 수 있습니다. 
- 반복문 내부에서 너무 복잡하거나 무거운 정규표현식을 여러 개 실행하기보다는, **가장 가능성 높은 패턴**을 먼저 체크하고 `break` 하거나 `if-else`로 분기처리하십시오.
- `extractLogIds`와 같이 여러 정보를 한 번에 반환하는 함수를 써서 루프 횟수를 줄이십시오.

### 5. AI 에이전트 체크리스트
- [ ] Windows `ProcessId`/`ThreadId`를 지원하는가?
- [ ] Android/Tizen의 `[PID:TID]` 및 `Date Time PID TID` 포맷을 지원하는가?
- [ ] 사용자가 커스텀하게 찍은 `(P x, T y)` 포맷을 지원하는가?
- [ ] 시간 파싱 정규표현식이 `+` 기호나 밀리초 유무에 상관없이 견고한가?
- [ ] 추출된 ID가 없을 때 `Main` 또는 `null`로 안전하게 폴백(Fallback)하는가?
