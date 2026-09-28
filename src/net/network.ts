import { useSyncExternalStore } from 'react';

// Network Information API: Chromium on Android only. Firefox (since 99) and every iOS browser leave it out.
interface NetworkInformation extends EventTarget {
  type?: string;
}

const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

const subscribe = (listener: () => void) => {
  connection?.addEventListener('change', listener);
  return () => connection?.removeEventListener('change', listener);
};

/**
 * On mobile data (3G/4G/5G). Carrier NAT blocks direct WebRTC and we have no TURN relay,
 * so guests usually can't reach a table hosted here. False when the browser doesn't tell.
 */
export const useMobileData = () => useSyncExternalStore(subscribe, () => connection?.type === 'cellular');
