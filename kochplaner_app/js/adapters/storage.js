// Lokaler Speicher (localStorage), mit Rueckfall auf den Arbeitsspeicher, falls der Browser ihn verweigert (z. B. privater Modus).
export function createStorage(backend, prefix = 'kp.') {
  let store = backend;
  const mem = new Map();
  let ok = true;
  try {
    if (!store) throw new Error('kein Speicher');
    store.setItem(prefix + '__test', '1');
    store.removeItem(prefix + '__test');
  } catch { ok = false; store = null; }
  return {
    persistent: ok,
    get(key, fallback = null) {
      try {
        const raw = ok ? store.getItem(prefix + key) : mem.get(key);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { if (ok) store.setItem(prefix + key, raw); else mem.set(key, raw); } catch { mem.set(key, raw); }
    },
    remove(key) { try { if (ok) store.removeItem(prefix + key); else mem.delete(key); } catch { mem.delete(key); } },
  };
}
