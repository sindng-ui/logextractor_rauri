# HappyTool Headless CLI User Guide 🐧🚀

형님, 이 가이드는 HappyTool의 백그라운드 구동 모드인 **Headless CLI (Command Line Interface)** 엔진의 사용법과 예제를 다룹니다! GUI를 열지 않고도 대규모 로그 파일을 필터링하거나, 백그라운드에서 복잡한 시스템 자동화 테스트(BlockTest)를 돌리고 싶을 때 활용하실 수 있는 마법의 지팡이입니다. 💎

---

HappyTool의 CLI 기반 모듈은 실행 환경에 따라 아래와 같은 방법으로 진입할 수 있습니다.

### 📦 패키징 배포판 세팅 (Production)
`HappyTool.exe` 파일이 있는 위치(보통 설치 폴더)에서 터미널을 열고 실행합니다.
```powershell
# 기본 사용법
.\HappyTool.exe cli [command] [options]

# 도움말 확인
.\HappyTool.exe cli --help
```

### 👨‍💻 개발 환경 세팅 (Development)
소스 코드 환경에서는 `npm run cli`를 활용합니다.
```bash
# 기본 사용법
npm run cli -- [command] [options]
```

---

## 🛠️ 주요 CLI 커맨드 모음

### 1. `log-extractor` (대용량 로그 필터링 엔진) 📡
GUI에서 미리 저장해 둔 `Mission (Filter)`을 불러와, 터미널 환경에서 백그라운드로 거대한 로컬 로그 파일을 즉시 필터링하고 파일로 내보냅니다.

- **옵션:**
  - `-f, --filter <name>`: [필수] HappyTool GUI에 저장된 미션(필터 그룹) 이름
  - `-i, --input <path>`: [필수] 필터링할 원본 로그 파일의 절대 경로
  - `-o, --output <path>`: 추출 결과를 저장할 위치 (옵션, 생략 시 현재 폴더에 timestamp 포맷으로 생성됨)

- **사용 예시:**
  ```bash
  # EXE 사용 시
  .\HappyTool.exe cli log-extractor -f "Crash Hunt" -i "C:\logs\syslog.txt"
  ```

### 2. `block-test` (시나리오 & 파이프라인 자동화 봇) 🤖
BlockTest 엔진을 호출하여 사전에 작성해 둔 복잡한 파이프라인(명령어, 반복문, 조건문, 이미지 매칭 등)이나 거대한 시나리오 세트를 일괄 실행합니다.

- **옵션 (둘 중 하나 필수):**
  - `-s, --scenario <name>`: 설정한 여러 파이프라인의 묶음인 전체 시나리오 실행
  - `-p, --pipeline <name>`: 테스트할 단일 파이프라인 바로 실행

- **사용 예시:**
  ```bash
  # "Sanity Check" 라는 이름의 전체 시나리오 세트 실행
  npm run cli -- block-test --scenario "Sanity Check"
  
  # "Login Flow" 라는 단일 파이프라인 테스트 즉각 실행
  npm run cli -- block-test --pipeline "Login Flow"
  ```

### 3. `json-tool` (초고속 JSON 포매터) 🛠️
더럽고 압축된 대용량 JSON 파일을 순식간에 읽기 좋게 Formatting (Beautify) 하여 저장합니다.

- **옵션:**
  - `-i, --input <path>`: [필수] 정렬할 원본 JSON 파일 경로
  - `-o, --output <path>`: 변환된 JSON 파일 저장 경로 (생략 시 `beautified_오늘날짜.json` 형태로 현재 폴더에 생성됨)

- **사용 예시:**
  ```bash
  npm run cli -- json-tool -i "./raw_data.json" -o "./pretty_data.json"
  ```

### 4. `post-tool` (CLI 기반 백그라운드 API 테스터) 🌐
GUI의 Post Tool에 저장해 둔 요청(Request)을 터미널에서 손쉽게 쏴볼 수 있습니다. 자동화 파이프라인과 결합하여 주기적 Health Check 용도로 쓰기 좋습니다.

- **옵션:**
  - `-n, --name <name>`: [필수] Post Tool (UI)에 저장한 Request 이름

- **사용 예시:**
  ```bash
  # "Login API" 요청을 백그라운드에서 바로 발송
  npm run cli -- post-tool -n "Login API"
  ```

### 5. `tpk-extractor` (Tizen RPM 파서) 📦
Tizen 단말에 설치되는 `.tpk` 패키지를 `.rpm` 파일에서 추출합니다. 대용량 파일도 즉각적으로 Parsing하여 추출해냅니다! URL을 바로 던져도 동작합니다.

- **옵션:**
  - `-i, --input <path_or_url>`: [필수] 추출 대상 RPM의 로컬 절대 경로 혹은 HTTP URL
  - `-o, --output <path>`: TPK 저장 위치 지정 (옵션)

- **사용 예시:**
  ```bash
  npm run cli -- tpk-extractor -i "https://my-repo/package.rpm"
  npm run cli -- tpk-extractor -i "/var/downloads/some-app.rpm" -o "./result.tpk"
  ```

### 6. `nettraffic` (네트워크 트래픽 자동 분석기) 📡🌐
네트워크 로그를 분석하여 엔드포인트 통계, User Agent 분포, 시간별 트래픽 인사이트를 추출합니다.

- **옵션:**
  - `-i, --input <path>`: **[Single Mode]** 분석할 단일 로그 파일 경로
  - `-l, --left <path>`: **[Compare Mode]** 기준이 되는 첫 번째(Base) 로그 파일
  - `-r, --right <path>`: **[Compare Mode]** 비교 대상이 되는 두 번째(Target) 로그 파일
  - `-o, --output <path>`: 결과 JSON 분석 리포트 저장 위치 (생략 시 `nettraffic_result_시간.json` 생성)

- **사용 예시:**
  ```bash
  # [Single] 단일 파일 분석 및 결과 JSON 저장
  .\HappyTool.exe cli nettraffic -i "./traffic.log" -o "./analysis.json"
  
  # [Compare] 두 로그 파일의 트래픽 증감 비교 (Diff)
  .\HappyTool.exe cli nettraffic -l "./old.log" -r "./new.log" -o "./diff.json"
  ```

---

## 🌟 CLI 동작 원리 팁 (Advanced)

저희 HappyTool CLI 모드는 평범한 터미널 스크립트가 아닙니다!
명령어를 치면 내부적으로 완전히 숨겨진 **BrowserWindow (Hidden Window)**가 생성되어 Electron 메인 프로세스와 렌더러 프로세스 사이의 IPC 파이프를 엽니다. 

그 덕분에:
1. NodeJS 환경에서 지원되지 않는 고성능 **WebAssembly(WASM)** 및 **SharedArrayBuffer** 메모리를 단 하나도 낭비 없이 터미널 로직에서도 쓸 수 있습니다! OOM(메모리 초과)이 없는 완벽한 설계입니다!
2. Chrome V8 JIT 환경이 터미널에서도 똑같이 구동되어 성능의 이점을 거저 가져옵니다!
3. IndexedDB(로컬 데이터베이스)에 GUI에서 저장했던 필터 리스트와 시나리오 목록들을 터미널 환경에서도 투명하게 똑같이 참조하고 씁니다.

> [!TIP]
> **성능 이슈를 주의하십시오!** CLI 진행률(Progress 바 처리 상태)은 백그라운드에서 실시간으로 갱신되며, `-o` 경로 저장 성공 여부 혹은 에러 발생 요인은 Exit Code (`0` 또는 `1`)로 터미널에 명확히 표기됩니다. 🐧🚀
