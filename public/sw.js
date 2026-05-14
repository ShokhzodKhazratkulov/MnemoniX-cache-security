const CACHE_NAME = 'mnemonix-v2';
const QUEUE_IDB_NAME = 'keyval-store';
const QUEUE_IDB_KEY = 'mnemonix_sync_queue';

// ── Install & Activate ────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Cache app shell on fetch (cache-first for static assets) ─────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache GET requests for same-origin static assets
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // never cache API calls

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached); // offline fallback
      return cached || networkFetch;
    })
  );
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'mnemonix-sync') {
    event.waitUntil(processQueue());
  }
});

// Read the sync queue from IndexedDB (idb-keyval stores under 'keyval-store')
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_IDB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readQueue(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keyval', 'readonly');
    const req = tx.objectStore('keyval').get(QUEUE_IDB_KEY);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function writeQueue(db, queue) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keyval', 'readwrite');
    const req = tx.objectStore('keyval').put(queue, QUEUE_IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function processQueue() {
  let db;
  try {
    db = await openQueueDB();
  } catch (e) {
    console.warn('[SW] Could not open IDB:', e);
    return;
  }

  const queue = await readQueue(db);
  const pending = queue.filter((t) => t.status === 'pending');

  if (!pending.length) return;

  // Get Supabase config stored in IDB by the app at boot
  const config = await new Promise((resolve) => {
    const tx = db.transaction('keyval', 'readonly');
    const req = tx.objectStore('keyval').get('mnemonix_sw_config');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });

  if (!config?.supabaseUrl || !config?.supabaseKey) {
    console.warn('[SW] No Supabase config in IDB — skipping sync');
    return;
  }

  const { supabaseUrl, supabaseKey } = config;
  const updatedQueue = [...queue];

  for (const task of pending) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${task.table}`, {
        method: task.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${task.userToken || supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(task.payload),
      });

      const idx = updatedQueue.findIndex((t) => t.id === task.id);
      if (res.ok) {
        updatedQueue.splice(idx, 1); // remove on success
      } else {
        const retries = (task.retries || 0) + 1;
        updatedQueue[idx] = {
          ...task,
          retries,
          status: retries >= 5 ? 'failed' : 'pending',
        };
      }
    } catch (e) {
      const idx = updatedQueue.findIndex((t) => t.id === task.id);
      const retries = (task.retries || 0) + 1;
      updatedQueue[idx] = {
        ...task,
        retries,
        status: retries >= 5 ? 'failed' : 'pending',
      };
    }
  }

  await writeQueue(db, updatedQueue);
  console.log('[SW] Background sync complete');
}
