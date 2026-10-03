/* The notification worker caches no application or private data. */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const data = event.data?.json();
      if (
        !data ||
        !/^\/(es|en|pt)\/notifications\/[0-9a-f-]{36}$/i.test(data.path)
      )
        return;
      await self.registration.showNotification("Rent · " + data.title, {
        body: "Abrir para dar seguimiento",
        tag: data.tag,
        data: { path: data.path },
      });
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const tab of tabs) tab.postMessage({ type: "rent-notification" });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const path = event.notification.data?.path;
      if (!/^\/(es|en|pt)\/notifications\/[0-9a-f-]{36}$/i.test(path ?? ""))
        return;
      const url = new URL(path, self.location.origin).href;
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const tab = tabs.find(
        (t) => new URL(t.url).origin === self.location.origin,
      );
      if (tab) {
        await tab.navigate(url);
        await tab.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
