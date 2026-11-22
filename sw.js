// Service Worker - handball-analyzer v1 (オフライン起動対応)
// 遠征先の圏外体育館でも起動できるよう、全資産をプリキャッシュする。
// 記録は localStorage、送信はオンライン復帰後でよい設計。
const CACHE_NAME = 'handball-analyzer-v11';
// 自分の系統のキャッシュの名前の頭。同じ場所にある他のアプリ（メンタル・分析担当用・LAB）の分には触らない
const CACHE_PREFIX = 'handball-analyzer-';

// ── 決まり（2026-11-21 の不具合「画面は出るが押しても動かない」を受けて）──
// ・新しい版は、下の資産が「全部」取れたときだけ入れ替わる。1つでも取れなければ、前の版のまま動き続ける。
// ・下の資産はキャッシュにある物をそのまま出す（裏で書きかえない）。
//   → アプリを直したら、必ず CACHE_NAME を上げる。上げないと端末に届かない。
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './styles.css?v=30',
  './lib/roster.js?v=16',
  './lib/stats.js?v=17',
  './lib/csv.js?v=17',
  './app.js?v=36',
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

const ASSET_URLS = ASSETS.map(u => new URL(u, self.location).href);

self.addEventListener('install', e => {
  // 1つでも取れなかったら失敗にする（＝前の版が残り、次に開いたときにまた試す）
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin', cache: 'reload' }))
          .then(resp => {
            if (!resp || !(resp.status === 200 || resp.type === 'opaque')) throw new Error('precache failed: ' + url);
            return cache.put(url, resp);
          })
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // ここに来るのは全部そろった後だけ。自分の系統の古い版だけ消す
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (NO_CACHE_HOSTS.some(host => url.hostname.includes(host))) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      // 画面そのもの（index.html）と、そろえてある資産は、キャッシュの物をそのまま出す
      const scopePath = new URL('./', self.location).pathname;
      // 自分の画面だけ（同じ場所の下にある分析担当用 analyst/ などは、ここでは扱わずネットから取る）
      const isPage = e.request.mode === 'navigate' && (url.pathname === scopePath || url.pathname === scopePath + 'index.html');
      const key = isPage ? './index.html' : e.request;
      return cache.match(key).then(cached => {
        if (cached && (isPage || ASSET_URLS.includes(e.request.url))) return cached;
        // それ以外（フォントなど）は、あれば出しつつ裏で新しくする
        const networkFetch = fetch(e.request).then(resp => {
          if (resp && (resp.status === 200 || resp.type === 'opaque')) cache.put(e.request, resp.clone());
          return resp;
        }).catch(() => cached || Response.error());
        return cached || networkFetch;
      });
    })
  );
});
