// Service worker: يخلي التطبيق ينفتح فوراً، ويحفظ الصور المصغّرة حتى ما تنزل كل مرة.
const VERSION = 'v1';
const SHELL = 'shell-' + VERSION;
const IMGS = 'imgs-v1';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-180.png', 'favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // صور Supabase الموقّعة: الرابط يتغير كل مرة بس الصورة نفسها ما تتغير (اسمها فريد)،
  // فنحفظها بالمسار بدون الرمز.
  if (url.pathname.includes('/storage/v1/object/sign/photos/')) {
    const key = url.origin + url.pathname;
    e.respondWith(caches.open(IMGS).then(async (c) => {
      const hit = await c.match(key);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(key, res.clone());
      return res;
    }));
    return;
  }

  // مكتبة Supabase من الـ CDN (نسخة ثابتة): من الكاش دائماً
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // ملفات التطبيق: من الكاش فوراً، وبنفس الوقت نحدّثها من الشبكة للمرة الجاية
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
