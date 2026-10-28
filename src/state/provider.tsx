import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import { getBlocker } from '../native';
import { UnscrollController, type Snapshot } from './controller';

const Ctx = createContext<UnscrollController | null>(null);

export function UnscrollProvider({
  children,
  controller,
}: {
  children: ReactNode;
  controller?: UnscrollController;
}) {
  const ctrl = useMemo(() => controller ?? new UnscrollController(getBlocker(), AsyncStorage), [controller]);

  useEffect(() => {
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    const startTimers = () => {
      if (!tickTimer) tickTimer = setInterval(() => void ctrl.tick(), 1000);
      if (!statusTimer) statusTimer = setInterval(() => void ctrl.refreshStatus(), 4000);
    };
    const stopTimers = () => {
      if (tickTimer) clearInterval(tickTimer);
      if (statusTimer) clearInterval(statusTimer);
      tickTimer = statusTimer = null;
    };
    void ctrl.init().then(startTimers);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void ctrl.tick();
        void ctrl.refreshStatus();
        startTimers();
      } else stopTimers();
    });
    return () => {
      stopTimers();
      sub.remove();
    };
  }, [ctrl]);

  return <Ctx.Provider value={ctrl}>{children}</Ctx.Provider>;
}

export function useController(): UnscrollController {
  const c = useContext(Ctx);
  if (!c) throw new Error('useController must be used inside UnscrollProvider');
  return c;
}

export function useUnscroll(): Snapshot {
  const c = useController();
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
}
