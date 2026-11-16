// Service Worker - handball-analyzer 分析担当用 v1 (オフライン起動対応)
// 遠征先の圏外体育館でも起動できるよう、全資産をプリキャッシュする。
// 記録は localStorage、送信はオンライン復帰後でよい設計。
const CACHE_NAME = 'handball-analyst-v5';

const ASSETS = [
  './',
  './index.html',
  './styles.css?v=a5',
  './lib/roster.js?v=a5',
  './lib/stats.js?v=a5',
  './lib/csv.js?v=a5',
  './app.js?v=a5',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-database-compat.js'
];

const NO_CACHE_HOSTS = [
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com',
  'identitytoolkit',
  'securetoken'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin' }))
          .then(resp => cache.put(url, resp))
          .catch(err => console.warn('[SW] precache failed:', url, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      // 分析担当用: 自分の系統（handball-analyst-）の古いキャッシュだけ消す。
      // 同じ場所にある生徒用アプリのキャッシュには触らない。
      keys.filter(k => k.startsWith('handball-analyst-') && k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (NO_CACHE_HOSTS.some(host => url.hostname.includes(host))) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(resp => {
        if (resp && (resp.status === 200 || resp.type === 'opaque')) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, respClone));
        }
        return resp;
      }).catch(() => {
        if (cached) return cached;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
      return cached || networkFetch;
    })
  );
});
