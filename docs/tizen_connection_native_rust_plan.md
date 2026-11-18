# Tizen Connection (SDB / SSH / Serial) Rust 네이티브 전환 구현 계획서

## 1. 현황 진단 및 원인 분석

`happytool_tauri` 및 오라클(`happytool_electron`) 코드를 비교 점검한 결과, 현재 Tizen Connection 모달에서 **Auto-detect/Rescan은 되지만 연결(Connect) 시 12초 Timeout이 발생하는 원인**과 부수 결함은 다음과 같습니다.

1. **릴리스 빌드에서 포트 `3003` Node 서버 미기동**
   - `src-tauri/src/lib.rs` / `stream_engine.rs`는 실행 파일 옆 `<exe_dir>/server/index.cjs`를 찾으나, `tauri.conf.json` 번들 리소스 경로(`_up_/server/...`) 및 `node_modules`(`socket.io`, `ssh2`, `serialport` C++ 네이티브 애드온) 미번들로 인해 Release 앱에서 `server/index.cjs`가 실행되지 않음.
2. **`HybridTauriSocket`의 가짜 `'connect'` 및 반쪽짜리 Fallback (`utils/tauriSocket.ts`)**
   - 포트 `3003` 연결 실패 시 `activateNativeFallback()`이 실제 서버 없이 `connected = true` + `'connect'` 이벤트를 발생시켜 모달에 `"Connected to Local Log Server"`가 표시됨.
   - `emit` 분기에 **`list_sdb_devices` / `list_serial_ports`만 Rust 커맨드로 연결되어 있어 스캔만 성공**하고, 실제 연결 이벤트(`connect_sdb`, `connect_ssh`, `connect_serial` 및 `*_write`, `disconnect_*`, `*_clear`, `connect_sdb_remote`, `serial_special_key`, `ssh_auth_response`)는 미구현이라 끊어진 `ioSocket`으로 빠지며 12초 Timeout이 발생함.
3. **프로토콜·UX 세부 불일치**
   - `components/TizenConnectionModal.tsx`의 `RESCAN` 버튼이 `socket.emit('list_sdb_devices')` 호출 시 `{ sdbPath }`를 누락함.
   - `server/index.cjs`의 `connect_sdb` 자동 복구(`sdb connect`)에 10초 타임아웃 가드가 누락되어 있고, UI 모달 타임아웃(`12s`)이 SSH `readyTimeout`(`20s`) 및 SDB 복구(`5s+10s`)보다 짧음.
   - `hooks/useTizenConnection.ts`의 `serial_special_key`는 `'ctrl_p' | 'ctrl_c' | 'ctrl_p_thrice'`를 전송함(오라클 규격).

---

## 2. 구현 설계 (기존 로직 100% 보존, Node 의존성 → Rust 네이티브 전환)

### Module 1. 공용 스트림 배처 & 유틸 (`src-tauri/src/commands/stream_engine.rs`)
- Electron/Node `server/index.cjs`와 동일한 20ms 로그 배칭 & UTF-8 멀티바이트 경계 보존(`Vec<u8>` 잔여 바이트 이월), `ignore_logs` (`sdb_clear`/`ssh_clear`), `debugMode` (`tizen_debug_*.log`), `saveToFile` (`sdb_*.txt`/`ssh_*.txt`/`serial_*.txt`) 공용 헬퍼 `LogStreamSession` 구성.
- `native_list_sdb_devices`를 Node와 동일하게 *"시스템 `sdb` 우선 시도 → 실패 시 커스텀 `sdbPath` 폴백"* 으로 보강.
- Tauri 환경에서는 외부 `node server/index.cjs` 상주가 불필요하므로 `lib.rs` 시작 시 `spawn_backend_server` 자동 실행 제거(웹 개발 모드용 `server/index.cjs`는 유지).

### Module 2. SDB 네이티브 스트림 엔진 (`src-tauri/src/commands/stream_sdb.rs`, 신규)
- 기존 `server/index.cjs`의 SDB 로직을 그대로 Rust `std::process::Command` / Tokio 비동기 파이프로 이식:
  - `sdb_connect`:
    1. 기존 SDB 세션 정리.
    2. `sdb [-s <deviceId>] shell echo READY` 검증 (5초 타임아웃).
    3. 실패 & `target not found` 시 Auto-Recovery (`sdb_status: connecting/reconnecting` emit → `sdb disconnect <ip>` → `sdb connect <ip>` [10초 타임아웃] → `sdb -s <ip> root on` → 재검증).
    4. 성공 시 `sdb [-s <deviceId>] shell` 상시 프로세스 스폰 + `sdb_status: connected` emit + stdout/stderr `LogStreamSession` 20ms 배칭 emit + 비정상 종료 시 `sdb_error` / `sdb_status: disconnected` emit.
  - `sdb_write(data)`: `ignore_logs = false` 후 child stdin 쓰기 + flush.
  - `sdb_clear()`: `ignore_logs = true` + 미전송 로그 버퍼 비우기.
  - `sdb_disconnect()`: 의도적 종료 플래그 설정 후 child process kill + `sdb_status: disconnected`.
  - `sdb_connect_remote(ip, sdb_path)`: `disconnect` → `connect` → `root on` 순차 실행 후 `sdb_remote_result` emit.

### Module 3. Serial 네이티브 스트림 엔진 (`src-tauri/src/commands/stream_serial.rs`, 신규)
- 이미 `Cargo.toml`에 포함된 `serialport = "4"` 크레이트 사용 (추가 의존성 없음):
  - `serial_connect(port, baud_rate, save_to_file, debug)`: 8N1 설정 오픈, 백그라운드 리더 스레드(20ms 배칭 emit), `serial_status: { status: "connected" }` / `serial_error` / `serial_status: { status: "disconnected" }` emit.
  - `serial_write(data)`: 오픈된 포트 writer 쓰기.
  - `serial_special_key(key)`: `'ctrl_p'`(`0x10`), `'ctrl_c'`(`0x03`), `'ctrl_p_thrice'`(`[0x10,0x10,0x10]`), `'ctrl+z'`(`0x1A`), `'ctrl+d'`(`0x04`), `'break'` 일괄 지원.
  - `serial_disconnect()`: 리더 스레드 중단 플래그 + 포트 닫기.

### Module 4. SSH 네이티브 스트림 엔진 (`src-tauri/src/commands/stream_ssh.rs`, 신규 + `russh`)
- 순수 Rust `russh` 크레이트 추가 (OpenSSL/C 빌드 없이 Windows MSVC 호환):
  - `ssh_connect(host, port, username, password, debug, save_to_file)`:
    - TCP 연결 및 SSH 핸드셰이크 (`readyTimeout: 20s`, keepalive `10s`), `password` 및 `keyboard-interactive` 인증 지원(`ssh_auth_request` emit 및 `ssh_auth_response` 채널 전달).
    - Interactive Shell/PTY 채널 오픈 + stdout/stderr/banner를 `LogStreamSession`으로 배칭 emit.
    - 인증 실패 / Connection Refused / Timeout / Host Not Found 등 Electron 오라클 수준의 명확한 `ssh_error` 메시지 매핑.
  - `ssh_write(data)`, `ssh_clear()`, `ssh_disconnect()`.

### Module 5. Frontend 소켓 어댑터 & 모달 정리 (`utils/tauriSocket.ts`, `components/TizenConnectionModal.tsx`, `lib.rs`)
- `HybridTauriSocket` (`utils/tauriSocket.ts`):
  - `isTauriEnvironment()`일 때는 Dead Port `3003` 접속 시도나 가짜 `'connect'`를 생략하고 즉시 Tauri Native 이벤트(`tauri-sdb-status`, `tauri-sdb-error`, `tauri-ssh-status`, `tauri-ssh-error`, `tauri-ssh-auth-request`, `tauri-serial-status`, `tauri-serial-error`, `tauri-sdb-remote-result`, `tauri-log-data`) 구독 및 `invoke`로 모든 이벤트 직접 라우팅.
  - 비-Tauri 브라우저 환경에서는 기존 `io('http://127.0.0.1:3003')` 그대로 유지.
- `TizenConnectionModal.tsx`:
  - `RESCAN` 버튼이 `socket?.emit('list_sdb_devices', { sdbPath })`로 `sdbPath`를 함께 전달.
  - `startTimeout` 시간을 백엔드 타임아웃에 맞게 보정(SSH `22s`, SDB `20s`, Serial `12s`) 및 `sdb_status` `'connecting'`/`'reconnecting'` 상태 수신 시 타임아웃 리셋(조기 타임아웃 방지).
  - Serial 포트 목록 갱신 시 기존 선택 포트가 목록에 없으면 첫 번째 포트로 보정.
- `src-tauri/src/lib.rs` & `commands/mod.rs`:
  - 신규 커맨드 일괄 등록 및 `WindowEvent::CloseRequested` / `Destroyed` 시 활성 SDB/SSH/Serial 세션 깔끔 정리.

---

## 3. 검증 계획
1. `cargo check --manifest-path src-tauri/Cargo.toml` 및 `cargo test` (UTF-8 경계 배칭, 특수키 매핑, SDB 디바이스 파싱, `sdb` args 생성 등 단위 테스트 추가)
2. `npx vitest run` (`HybridTauriSocket` 이벤트 라우팅 및 `TizenConnectionModal` `RESCAN`/`timeout` 회귀 테스트 추가)
3. `npm run build` (`vite build`) & 파일 길이 900줄 미만 점검
4. `important/APP_MAP.md` 및 `docs/tizen_connection_test_results.txt` 업데이트
