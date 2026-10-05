import { useSyncExternalStore } from 'react';

// "Online" means BOTH: the browser has a network (navigator.onLine, false when
// Wi-Fi is off) AND our API answered the last request. The second part catches
// "Wi-Fi on but the server is unreachable".
let apiReachable = true;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function isOnline() {
  return navigator.onLine && apiReachable;
}

// Called by api/client.js after every request.
export function setApiReachable(reachable) {
  if (reachable === apiReachable) return;
  apiReachable = reachable;
  notify();
}

export function onConnectivityChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

window.addEventListener('online', notify);
window.addEventListener('offline', notify);

// While the API is unreachable, check every 10 seconds whether it is back.
setInterval(async () => {
  if (apiReachable || !navigator.onLine) return;
  try {
    const response = await fetch('/api/health');
    if (response.ok) setApiReachable(true);
  } catch {
    // still down
  }
}, 10_000);

/** React hook: re-renders the component when we go online/offline. */
export function useOnline() {
  return useSyncExternalStore(onConnectivityChange, isOnline);
}
