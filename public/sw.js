// sw.js - Service Worker cho CommuteCast
const CACHE_NAME = "commutecast-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.jpg",
  "/icon-512.jpg"
];

// Cài đặt Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching static assets with CACHE_NAME:", CACHE_NAME);
        // Use an array of urls. Ignore any failures for single elements gracefully.
        return Promise.allSettled(
          STATIC_ASSETS.map((url) => 
            cache.add(url).catch((err) => console.warn(`[SW] Failed to cache: ${url}`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Kích hoạt Service Worker
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[SW] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Xử lý sự kiện Push Notification từ máy chủ / đám mây
self.addEventListener("push", (event) => {
  let data = { 
    title: "CommuteCast - Sẵn sàng phát!", 
    body: "Bản tin phát thanh cá nhân hóa mới của bạn đã hoàn thành!" 
  };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192.jpg",
    badge: "/icon-192.jpg",
    vibrate: [100, 50, 100],
    data: {
      url: "/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Xử lý sự kiện click vào thông báo để dẫn người dùng quay lại ứng dụng
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      // Nếu có sẵn tab ứng dụng đang mở, tập trung tiêu điểm (focus) vào tab đó
      for (const client of clientList) {
        if (client.url === "/" && "focus" in client) {
          return client.focus();
        }
      }
      // Ngược lại, mở một tab ứng dụng mới
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })
  );
});

// Xử lý fetch
self.addEventListener("fetch", (event) => {
  // Only cache GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  // Avoid intercepting API routes (like /api/synthesize or /api/news) or external API keys requests,
  // we want these to always reach the server when online, or fail with a clear message offline
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Trả về từ cache nếu có, ngược lại fetch từ mạng và lưu lại cache động (nếu là tài nguyên tĩnh)
        return response || fetch(event.request).then((networkResponse) => {
          // Don't cache range requests (like partial audio playbacks) or error responses
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
            return networkResponse;
          }

          // Dynamic caching of assets (css, js, assets etc)
          const mime = networkResponse.headers.get("content-type") || "";
          if (mime.includes("javascript") || mime.includes("css") || mime.includes("image") || mime.includes("font")) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cacheCopy);
            });
          }

          return networkResponse;
        }).catch(() => {
          // Nếu mất mạng không có cache và đang điều hướng trang chính (navigate), trả về index.html
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
