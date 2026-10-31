export type CommandBlock = any;
export type Pipeline = any;

export interface TrafficPattern {
  id: string;
  alias: string;
  keywords: string;
  extractRegex: string;
  enabled: boolean;
}

export interface UAPattern {
  keywords: string;
  template: string;
  enabled: boolean;
}

export interface NetTrafficSettings {
  uaPattern: UAPattern;
  patterns: TrafficPattern[];
}

export enum ToolId {
  LOG_EXTRACTOR = 'LOG_EXTRACTOR',
  POST_TOOL = 'POST_TOOL',
  TPK_EXTRACTOR = 'TPK_EXTRACTOR',
  JSON_TOOLS = 'JSON_TOOLS',
  SMARTTHINGS_DEVICES = 'SMARTTHINGS_DEVICES',
  SMARTTHINGS_LAB = 'SMARTTHINGS_LAB',
  REVERSE_ENGINEER = 'REVERSE_ENGINEER',
  BLOCK_TEST = 'BLOCK_TEST',
  EASY_UML = 'EASY_UML',
  CPU_ANALYZER = 'CPU_ANALYZER',
  SMART_HOME_DASHBOARD = 'SMART_HOME_DASHBOARD',
  SCREEN_MATCHER = 'SCREEN_MATCHER',
  AI_ASSISTANT = 'AI_ASSISTANT',
  TIZEN_LAB = 'TIZEN_LAB',
  EASY_POST = 'EASY_POST',
  PERF_TOOL = 'PERF_TOOL',
  SPEED_SCOPE = 'SPEED_SCOPE',
  NET_TRAFFIC_ANALYZER = 'NET_TRAFFIC_ANALYZER',
  LOG_ANALYSIS_AGENT = 'LOG_ANALYSIS_AGENT',
  GAUSS_CHAT_AGENT = 'GAUSS_CHAT_AGENT',
  EVERYTHING_SEARCH = 'EVERYTHING_SEARCH',
  RAG_ANALYZER_TEST = 'RAG_ANALYZER_TEST',
  NUPKG_SIGNER = 'NUPKG_SIGNER',
  RELEASE_HISTORY = 'RELEASE_HISTORY',
  ST_PRESENTATION_DICTIONARY = 'ST_PRESENTATION_DICTIONARY',
}

export interface LogHighlight {
  id: string;
  keyword: string;
  color: string;
  lineEffect?: boolean;
}

export interface HappyGroup {
  id: string;
  tags: string[];
  enabled: boolean;
  alias?: string;
}

export interface LogRule {
  id: string;
  name: string;
  includeGroups: string[][];
  happyGroups?: HappyGroup[];
  happyCombosEnabled?: boolean;
  disabledGroups?: string[][];
  excludes: string[];
  highlights: LogHighlight[];
  logCommand?: string;
  logTags?: string[];
  happyCombosCaseSensitive?: boolean;
  blockListCaseSensitive?: boolean;
  colorHighlightsCaseSensitive?: boolean;
  showRawLogLines?: boolean;
  perfThreshold?: number;
  dangerThresholds?: { ms: number; color: string; label: string }[];
}

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E';

export interface LogLevelStyle {
  level: LogLevel;
  color: string;
  enabled: boolean;
}

export interface LogViewPreferences {
  rowHeight: number;
  fontSize: number;
  fontFamily?: string;
  levelStyles: LogLevelStyle[];
  logLevelOpacity?: number;
  rowHeightOffset?: number;
  showLineNumbers?: boolean;
  splitAnalyzerHeight?: number;
}

export interface PostGlobalVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface EnvironmentProfile {
  id: string;
  name: string;
  variables: PostGlobalVariable[];
}

export interface PostGlobalAuth {
  enabled: boolean;
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyKey?: string;
  apiKeyValue?: string;
  apiKeyAddTo?: 'header' | 'query';
}

export interface RequestHistoryItem extends SavedRequest {
  executedAt: number;
}

export type STSpecialRequestId = 'locations' | 'rooms' | 'devices';

export interface STSpecialRequest {
  id: STSpecialRequestId;
  label: string;
  icon: string;
  method: HttpMethod;
  url: string;
  description: string;
}

export interface STLocation {
  locationId: string;
  name: string;
  raw: any;
}

export interface STRoom {
  roomId: string;
  locationId: string;
  name: string;
  raw: any;
}

export interface STDevice {
  deviceId: string;
  locationId: string;
  roomId?: string;
  label: string;
  deviceTypeName?: string;
  components?: any[];
  raw: any;
}

export interface STDiscoveryData {
  locations: STLocation[];
  rooms: STRoom[];
  devices: STDevice[];
  fetchedAt: number;
}

export type STNodeType = 'location' | 'room' | 'device';

export interface STSelectedNode {
  type: STNodeType;
  id: string;
  raw: any;
}

export interface AppSettings {
  logRules: LogRule[];
  savedRequests: SavedRequest[];
  savedRequestGroups?: RequestGroup[];
  requestHistory?: RequestHistoryItem[];
  postGlobalVariables?: PostGlobalVariable[];
  envProfiles?: EnvironmentProfile[];
  activeEnvId?: string;
  postGlobalAuth?: PostGlobalAuth;
  logViewPreferences?: LogViewPreferences;
  lastEndpoint: string;
  lastMethod: string;
  enabledPlugins?: string[];
  pluginOrder?: string[];
  blocks?: CommandBlock[];
  pipelines?: Pipeline[];
  mockEndpoints?: MockEndpoint[];
  defaultOutputFolder?: string;
  netTrafficSettings?: NetTrafficSettings;
  pluginSizes?: Record<string, 'normal' | 'wide' | 'large'>;
  zoomFactor?: number;
  stSpecialRequests?: STSpecialRequest[];
}

export interface RequestGroup {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface TestAssertion {
  id: string;
  type: 'status' | 'jsonPath' | 'responseTime' | 'header';
  field?: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'exists';
  expected?: string | number;
}

export interface TestResult {
  assertionId: string;
  passed: boolean;
  actual: any;
  expected: any;
  message: string;
}

export interface ResponseExtractor {
  id: string;
  name: string;
  source: 'body' | 'header' | 'status';
  jsonPath?: string;
  headerName?: string;
}

export interface MockEndpoint {
  id: string;
  enabled: boolean;
  method: string;
  path: string;
  statusCode: number;
  headers: { key: string; value: string }[];
  body: string;
  delay?: number;
}

export interface SavedRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  groupId?: string;
  auth?: {
    type: 'none' | 'bearer' | 'basic';
    bearerToken?: string;
    basicUsername?: string;
    basicPassword?: string;
  };
  tests?: TestAssertion[];
  extractors?: ResponseExtractor[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface PerfResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  timeTaken: number;
}

// --- Worker Types ---

export type WorkerStatus = 'idle' | 'indexing' | 'filtering' | 'ready' | 'error';

export interface LogWorkerMessage {
  type: 'INIT_FILE' | 'INIT_LOCAL_FILE_STREAM' | 'RPC_RESPONSE' | 'RPC_ERROR' | 'FILTER_LOGS' | 'GET_LINES' | 'GET_SURROUNDING_LINES' | 'GET_RAW_LINES' | 'INIT_STREAM' | 'PROCESS_CHUNK' | 'UPDATE_RULES' | 'FIND_HIGHLIGHT' | 'GET_LINES_BY_INDICES' | 'TOGGLE_BOOKMARK' | 'CLEAR_BOOKMARKS' | 'ANALYZE_TRANSACTION' | 'GET_PERFORMANCE_HEATMAP' | 'PERF_ANALYSIS' | 'ANALYZE_SPAM' | 'ANALYZE_LATENCY' | 'FIND_VISUAL_INDEX' | 'STREAM_DONE' | 'GET_FULL_TEXT' | 'SET_ACTIVE_STATE' | 'GET_ALL_METADATA' | 'GET_ANALYSIS_METRICS' | 'GET_ALIAS_EVENTS' | 'SEARCH_GLOBAL_MISSION';
  payload?: any;
  requestId?: string;
  workerSide?: 'left' | 'right';
}

export interface LogWorkerResponse {
  type: 'RPC_REQUEST' | 'RPC_RESPONSE' | 'RPC_ERROR' | 'STATUS_UPDATE' | 'INDEX_COMPLETE' | 'FILTER_COMPLETE' | 'LINES_DATA' | 'ERROR' | 'STREAM_FLUSH' | 'FIND_RESULT' | 'FULL_TEXT_DATA' | 'BOOKMARKS_UPDATED' | 'HEATMAP_DATA' | 'PERF_ANALYSIS_RESULT' | 'SPAM_ANALYSIS_RESULT' | 'LATENCY_ANALYSIS_RESULT' | 'HISTOGRAM_DATA' | 'STREAM_DONE' | 'BUFFER_SHARED' | 'ALL_METADATA_RESULT' | 'ANALYSIS_METRICS_RESULT' | 'ALIAS_EVENTS_RESULT' | 'SEARCH_GLOBAL_MISSION_RESULT';
  payload?: any;
  requestId?: string;
}

export interface LineRequest {
  startLine: number;
  count: number;
  encoding?: string;
}

export interface LineResult {
  lines: { lineNum: number, content: string }[];
}

export interface SpamLogResult {
  fileName: string;
  functionName: string;
  lineContent: string;
  count: number;
  lineNum?: number;
  indices: number[];
}

export interface LatencySpot {
  gapMs: number;
  beforeIndex: number;
  afterIndex: number;
  beforeLineNum: number;
  afterLineNum: number;
  beforePreview: string;
  afterPreview: string;
  beforeTimestamp: number;
  afterTimestamp: number;
}

export interface LogMetadata {
  fileName: string;
  functionName: string;
  timestamp: number | null;
  tid: string | null;
  lineNum: number;
  visualIndex: number;
  isError: boolean;
  isWarn: boolean;
  preview: string;
  codeLineNum?: string | null;
  signature?: string;
  alias?: string | null;
}

export interface HistogramBucket {
  startTime: number;
  endTime: number;
  count: number;
  firstVisualIndex?: number;
}

export interface HistogramData {
  buckets: HistogramBucket[];
  maxCount: number;
  totalCount: number;
}
