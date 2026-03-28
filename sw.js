// sw.js - Service Worker للمنبه الذكي مع دعم الخلفية الكامل
const CACHE_NAME = 'alarm-app-v2';
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// استقبال الرسائل من الصفحة
self.addEventListener('message', event => {
  const data = event.data;
  
  if (data.type === 'SAVE_ALARMS') {
    saveAlarmsToDB(data.alarms);
  }
  
  if (data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(data.title, {
      body: data.message,
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23667eea"/%3E%3Ctext x="50" y="67" font-size="50" text-anchor="middle" fill="white"%3E⏰%3C/text%3E%3C/svg%3E',
      vibrate: [200, 100, 200],
      requireInteraction: true
    });
  }
});

// Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'check-alarms') {
    event.waitUntil(checkAlarmsAndNotify());
  }
});

// فحص المنبهات وإرسال الإشعارات
async function checkAlarmsAndNotify() {
  const alarms = await getAlarmsFromDB();
  const now = Date.now();
  
  for (const alarm of alarms) {
    if (alarm.active && alarm.time <= now) {
      // إرسال إشعار
      await self.registration.showNotification(alarm.message, {
        body: `الوقت: ${alarm.timeString}`,
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23667eea"/%3E%3Ctext x="50" y="67" font-size="50" text-anchor="middle" fill="white"%3E⏰%3C/text%3E%3C/svg%3E',
        vibrate: [200, 100, 200],
        requireInteraction: true
      });
      
      // معالجة التكرار
      if (alarm.repeatType !== 'none') {
        let nextTime = getNextRepeatTime(alarm.time, alarm.repeatType);
        if (nextTime) {
          alarm.time = nextTime;
          alarm.timeString = new Date(nextTime).toLocaleTimeString('ar-EG');
          alarm.dateString = new Date(nextTime).toLocaleDateString('ar-EG');
          await updateAlarmInDB(alarm);
        } else {
          await deleteAlarmFromDB(alarm.id);
        }
      } else {
        await deleteAlarmFromDB(alarm.id);
      }
    }
  }
  
  // جدولة الفحص التالي
  setTimeout(() => {
    checkAlarmsAndNotify();
  }, 60000);
}

// IndexedDB Functions
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AlarmsDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('alarms')) {
        db.createObjectStore('alarms', { keyPath: 'id' });
      }
    };
  });
}

async function saveAlarmsToDB(alarms) {
  const db = await openDB();
  const transaction = db.transaction(['alarms'], 'readwrite');
  const store = transaction.objectStore('alarms');
  
  for (const alarm of alarms) {
    store.put(alarm);
  }
}

async function getAlarmsFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['alarms'], 'readonly');
    const store = transaction.objectStore('alarms');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function updateAlarmInDB(alarm) {
  const db = await openDB();
  const transaction = db.transaction(['alarms'], 'readwrite');
  const store = transaction.objectStore('alarms');
  store.put(alarm);
}

async function deleteAlarmFromDB(alarmId) {
  const db = await openDB();
  const transaction = db.transaction(['alarms'], 'readwrite');
  const store = transaction.objectStore('alarms');
  store.delete(alarmId);
}

function getNextRepeatTime(alarmTime, repeatType) {
  let date = new Date(alarmTime);
  
  switch(repeatType) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'always':
      date.setDate(date.getDate() + 1);
      break;
    default:
      return null;
  }
  return date.getTime();
}

// بدء الفحص الدوري
checkAlarmsAndNotify();

// الاستماع لإشعارات الضغط
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
