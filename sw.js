// Service worker «Книги Тишины» (собран tools/telefon.py) — как у «Захвата»: держит файлы программы в кэше,
// чтобы она открывалась без сети. «Сначала кэш»: файлы из кэша, сеть — только если файла там нет.
// VERSION меняется сам при каждой сборке — телефон подхватывает новую версию при следующем открытии.
const VERSION = 'kniga-2364682569';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', "./pdf/book-pdf.js", "./pdf/pdfmake.min.js", "./pdf/RobotoCondensed-Regular.ttf", "./pdf/RobotoCondensed-Bold.ttf", "./pdf/RobotoCondensed-Italic.ttf", "./pdf/RobotoCondensed-BoldItalic.ttf", "./pdf/LICENSE-pdfmake.txt", "./pdf/OFL-RobotoCondensed.txt"];

self.addEventListener('install', (ev) => {
  // cache: 'reload' — мимо кэша браузера, иначе новая версия могла бы взять старые файлы
  ev.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

// Новая версия включилась — удаляем старые кэши
self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
      // без сети и без кэша: для открытия страницы отдаём главный экран
      req.mode === 'navigate' ? caches.match('./index.html') : Response.error()
    ))
  );
});
