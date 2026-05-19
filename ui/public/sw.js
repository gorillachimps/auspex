// Auspex service worker. v1 — minimal scope:
//
//   1. Install/activate lifecycle that immediately claims open clients
//      so notifications fire on the first page load after registration.
//   2. notificationclick handler: focus an existing Auspex tab if one
//      is open, otherwise open a new one. Honours a `url` field on the
//      notification's data payload so each fill can deep-link to its
//      market detail page.
//   3. (Future) push event handler so server-sent pushes land here when
//      the tab is closed. Stub left in place for the eventual server-
//      push infrastructure work; right now we have nothing pushing to it.

self.addEventListener("install", (event) => {
  // Skip waiting so the new SW takes over without needing a tab close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/activity";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer an already-open Auspex tab — focus + navigate it in place
      // so the user doesn't end up with duplicate windows.
      for (const client of allClients) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client && targetUrl) {
              try {
                await client.navigate(targetUrl);
              } catch {
                // Some clients (e.g. Safari) reject programmatic navigate.
                // The focus above is enough.
              }
            }
            return;
          }
        } catch {
          // Bad URL on a stale client — skip it.
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

// Placeholder for future server-pushed notifications. The page-side polling
// fallback in useFillNotifications.ts handles fills while a tab is open;
// real "phone in your pocket" pushes need a server with the user's VAPID
// subscription on file, which we don't have yet.
self.addEventListener("push", (event) => {
  let payload = { title: "Auspex", body: "New activity", url: "/activity" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = { ...payload, ...parsed };
      }
    }
  } catch {
    // ignore parse errors; show the default
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/logo.png",
      badge: "/icon.svg",
      data: { url: payload.url },
      tag: payload.tag,
    }),
  );
});
