import { useLogViewPreferencesContext } from '../components/LogViewer/LogViewPreferencesContext';
export { defaultLogViewPreferences } from '../components/LogViewer/LogViewPreferencesContext';

/**
 * logViewPreferences 로드/저장/업데이트를 전담하는 훅.
 * 이제 전역 컨텍스트를 사용하여 모든 탭에서 설정을 공유합니다.
 */
export function useLogViewPreferences() {
    return useLogViewPreferencesContext();
}
