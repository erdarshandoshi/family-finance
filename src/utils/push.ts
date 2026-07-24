// Web Push enrolment. The service worker itself lives at /sw.js so it gets root scope.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState =
  | 'unsupported'      // browser has no Push API
  | 'needs-install'    // iOS Safari tab — must be added to the Home Screen first
  | 'denied'           // permission refused; only the user can undo this
  | 'off'
  | 'on';

// What can be reminded about, each with its own on/off and lead time (days before).
export type NotifyCategory = 'sip' | 'fd' | 'post';
export interface CategoryPref { enabled: boolean; leadDays: number; }
export type NotifyPrefs = Record<NotifyCategory, CategoryPref>;

export const DEFAULT_PREFS: NotifyPrefs = {
  sip:  { enabled: true, leadDays: 2 },   // debits are frequent — a short heads-up
  fd:   { enabled: true, leadDays: 7 },   // maturities are rare — more notice
  post: { enabled: true, leadDays: 7 },
};

/** iOS exposes the Push API only to a Home-Screen ("standalone") install. */
function isIosSafariTab(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);  // iPadOS
  if (!isIos) return false;
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIosSafariTab() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Preferences stored server-side for this device's subscription, or null if none. */
export async function fetchPrefs(): Promise<NotifyPrefs | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  try {
    const res = await fetch(`/api/push-subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (!res.ok) return null;
    const json = await res.json() as { prefs?: NotifyPrefs };
    return json.prefs ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask permission, subscribe, and register the subscription (with prefs) server-side. */
export async function enablePush(opts: { email: string; prefs: NotifyPrefs }): Promise<PushState> {
  if (!pushSupported()) return isIosSafariTab() ? 'needs-install' : 'unsupported';
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY is not set');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      email: opts.email,
      prefs: opts.prefs,
      userAgent: navigator.userAgent.slice(0, 200),
    }),
  });
  if (!res.ok) throw new Error(`Could not register for reminders (HTTP ${res.status})`);

  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await fetch('/api/push-subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

/** Update the per-category preferences for this device's subscription. */
export async function savePrefs(prefs: NotifyPrefs): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), prefs, partial: true }),
  }).catch(() => {});
}
