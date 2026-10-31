# Gauss 2.3 Think x HAPPY-MCP Protocol 전문 가이드 🐧🛰️

형님! 삼성 가우스 에이전트와 우리 HappyTool이 어떤 신호를 주고받는지, **단 한 글자의 생략도 없이** 실제 전문 예제를 기반으로 정리해 드립니다! 

---

## 1. 개요 (Overview)
HappyTool은 가우스 에이전트와 통신할 때 **HAPPY-MCP(Modern Chat Protocol) v1.1** 규격을 사용합니다. 통신은 기본적으로 **HTTP POST 요청**과 **SSE(Server-Sent Events) 스트리밍 응답**으로 이루어집니다.

- **엔드포인트**: `https://{gauss-agent-endpoint}/v1/agent/run` (설정된 주소)
- **헤더**: `x-api-key: {API_KEY}`, `Content-Type: application/json`

---

## 2. Simple Chat 모드 (Gauss Chat 플러그인용)
사용자와의 직접적인 대화를 위한 경량 프로토콜입니다.

### [REQUEST]
```json
{
  "input_type": "chat",
  "output_type": "chat",
  "input_value": "반가워 가우스! 너에 대해 소개해줘."
}
```

### [RESPONSE (Streaming Chunks)]
가우스는 SSE 규격에 따라 `data: ` 접두어와 함께 토큰 단위로 응답을 보냅니다.
```text
data: {"event": "token", "data": {"chunk": "안", "id": "msg-123", "timestamp": "2026-04-02 13:00:01 UTC"}}
data: {"event": "token", "data": {"chunk": "녕", "id": "msg-123", "timestamp": "2026-04-02 13:00:01 UTC"}}
data: {"event": "token", "data": {"chunk": "하", "id": "msg-123", "timestamp": "2026-04-02 13:00:02 UTC"}}
data: {"event": "token", "data": {"chunk": "세요", "id": "msg-123", "timestamp": "2026-04-02 13:00:02 UTC"}}
data: [DONE]
```

---

## 3. Multi-step 분석 모드 (Log Analysis Agent용)
LLM이 스스로 사고(`thought`)하고 도구(`action`)를 사용하는 고도화 프로토콜입니다. 모든 요청과 응답의 핵심은 `input_value`와 `output_value` 내부에 **JSON 문자열** 형태로 담깁니다.

### 3.1 1차 분석 요청 (Iteration 1)
에이전트에게 힌트 로그와 미션 정보를 전달하며 시작합니다.

#### [REQUEST]
```json
{
  "input_type": "agent",
  "output_type": "agent",
  "input_value": "{\"analysis_type\":\"crash\",\"mission_name\":\"CRASH_DEBUG\",\"iteration\":1,\"max_iterations\":10,\"context\":{\"initial_hints\":\"[Line 105] FATAL: NullPointerException at App.java:45\\n[Line 108] stacktrace...\",\"log_stats\":{\"total_lines\":50000,\"filtered_lines\":150,\"file_name\":\"main_log.txt\"}}}"
}
```

### 3.2 분석 중 응답 (PROCESSING + ACTION)
에이전트가 더 많은 로그 조사가 필요하다고 판단하여 도구를 요청하는 단계입니다.

#### [RESPONSE (Streaming Chunk)]
```text
data: {"output_value": "{\"status\": \"PROCESSING\", \"thought\": \"로그의 NullPointerException 발생 지점인 App.java:45 주변의 전체 문맥을 확인하기 위해 로그 범위를 가져오겠습니다.\", \"action\": {\"type\": \"FETCH_LOG_RANGE\", \"params\": {\"start_line\": 40, \"end_line\": 50, \"context_size\": 5}}}"}
```

### 3.3 후속 분석 요청 (Iteration 2+)
도구 실행 결과(`action_result`)를 에이전트에게 피드백으로 전달하는 단계입니다.

#### [REQUEST]
```json
{
  "input_type": "agent",
  "output_type": "agent",
  "input_value": "{\"analysis_type\":\"crash\",\"mission_name\":\"CRASH_DEBUG\",\"iteration\":2,\"max_iterations\":10,\"context\":{\"initial_hints\":\"...\",\"action_result\":\"[Line 40] log...\\n[Line 41] ...\",\"previous_thought\":\"로그의 NullPointerException...\",\"log_stats\":{...}}}"
}
```

### 3.4 최종 분석 완료 (COMPLETED)
더 이상의 도구 사용 없이 최종 리포트를 제출하는 단계입니다.

#### [RESPONSE (Streaming Chunk)]
```text
data: {"output_value": "{\"status\": \"COMPLETED\", \"thought\": \"로그 분석을 완료했습니다. 크래시의 원인은 유효하지 않은 컨텍스트 참조로 확인되었습니다.\", \"final_report\": \"## 🏁 최종 분석 보고서\\n\\n### 1. 요약\\nApp.java:45 라인에서...\\n\\n### 2. 원인\\n...\\n### 3. 해결 방안\\n...\"}"}
```

---

## 4. 스트리밍 예외 처리 규격
가우스 API 전처리 레이어에서 발생할 수 있는 원본 JSON 청크 예시입니다. (우리 파서가 모두 대응 중입니다!)

- **필드명 변형**: `data: {"output_value": "..."}` 대신 `data: {"message": "..."}` 또는 `data: {"delta": "..."}` 등의 형태로 올 수 있음.
- **순수 JSON 스트림**: `data: ` 접두어 없이 `{"event": "token", "data": {"chunk": "..."}}` 규격으로 전달되는 경우도 존재.

---

> [!TIP]
> **형님, 이 가이드만 있으면 가우스의 모든 속사정을 100% 엿볼 수 있습니다!** 🐧🚀 만약 규격이 바뀌어도 제가 만든 스마트 파서가 끝까지 추적해서 분석해 낼 테니 걱정 마십시오!
