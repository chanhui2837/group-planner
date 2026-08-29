self.addEventListener('push', function(event) {
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: event.data ? event.data.text() : 'Family Planner', body: '새 알림이 도착했어요!' }; }
  const title = data.title || 'Family Planner';
  const options = {
    body: data.body || '새 메시지가 도착했어요',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [300,100,300,100,500],
    data: data.url || '/',
    requireInteraction: true,
    actions: [{action:'open', title:'열기'}]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});

self.addEventListener('install', e=> self.skipWaiting());
self.addEventListener('activate', e=> self.clients.claim());
