import { getToken } from "./auth";
import { noticesApi } from "./api/agenda";
export async function enableWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error("Este navegador no admite notificaciones Push");
  const config = await noticesApi.config();
  if (!config.enabled || !config.publicKey)
    throw new Error(
      "Las notificaciones del navegador aún no están configuradas",
    );
  if ((await Notification.requestPermission()) !== "granted") return false;
  const registration = await navigator.serviceWorker.register(
    "/rent-notifications-sw.js",
    { scope: "/" },
  );
  await navigator.serviceWorker.ready;
  const key = config.publicKey.replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(
    atob(key.padEnd(Math.ceil(key.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await noticesApi.subscribe(subscription);
  return true;
}
export async function disableWebPush() {
  const authToken = getToken() ?? undefined;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try {
      await noticesApi.unsubscribe(sub.endpoint, authToken);
    } finally {
      await sub.unsubscribe();
    }
  }
}
