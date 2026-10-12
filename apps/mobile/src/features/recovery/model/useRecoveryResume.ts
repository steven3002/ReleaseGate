import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getOrCreateChainReader } from '../../../platform/rpc';
import { getActiveWorkspace } from '../../workspace';
import { resumePendingOperations } from './resume';

/**
 * Hook to automatically settle non-terminal operations on app launch and
 * whenever the app returns to the foreground.
 * Implements Flow F10 Step 5 ("Resume").
 */
export function useRecoveryResume(): void {
  const isResumingRef = useRef<boolean>(false);

  const runResume = async () => {
    if (isResumingRef.current) return;
    try {
      isResumingRef.current = true;
      const ws = await getActiveWorkspace();
      if (!ws) return;

      const chainReader = getOrCreateChainReader(ws.rpcUrl);
      const settled = await resumePendingOperations(chainReader);
      if (settled.length > 0) {
        console.log(`[Recovery] Resumed ${settled.length} pending operations.`);
      }
    } catch (err) {
      console.warn('[Recovery] Error resuming pending operations:', err);
    } finally {
      isResumingRef.current = false;
    }
  };

  useEffect(() => {
    // 1. Run on app startup
    runResume();

    // 2. Run whenever returning to foreground
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        runResume();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);
}
