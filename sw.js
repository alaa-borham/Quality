// Service worker — network-first for app HTML so updates always appear
const CACHE = 'qc-root-v5';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;
  // مكتبة Firebase (عنوان بإصدار ثابت) تُخزَّن كي يفتح التطبيق دون اتصال؛ اتصالات قاعدة البيانات نفسها لا تُخزَّن أبداً
  if (url.includes('gstatic.com/firebasejs/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => {
      if (resp.ok) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return resp;
    })));
    return;
  }
  if (url.includes('googleapis.com') || url.includes('gstatic.com') || url.includes('firebaseio') || url.includes('firebase')) return;
  const isHTML = req.mode === 'navigate' || url.endsWith('index.html');
  if (isHTML) {
    // Always try the network first for the app page → latest version
    e.respondWith(
      fetch(req).then(resp => { const cp = resp.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)); return resp; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  // Other assets: cache-first
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => {
    if (req.method === 'GET' && resp.ok) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return resp;
  })));
});
