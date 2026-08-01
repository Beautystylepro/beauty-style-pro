const memoryStore = new Map<string, string>();

let resolvedBrowserStorage: Storage | null | undefined;

function getBrowserStorage(): Storage | null {
  if (resolvedBrowserStorage !== undefined) {
    return resolvedBrowserStorage;
  }

  if (typeof window === "undefined") {
    resolvedBrowserStorage = null;
    return resolvedBrowserStorage;
  }

  const candidates: Storage[] = [];

  try {
    candidates.push(window.localStorage);
  } catch {
    // ignore unavailable localStorage
  }

  try {
    candidates.push(window.sessionStorage);
  } catch {
    // ignore unavailable sessionStorage
  }

  for (const storage of candidates) {
    try {
      const probeKey = "__style_safe_storage_probe__";
      storage.setItem(probeKey, "ok");
      storage.removeItem(probeKey);
      resolvedBrowserStorage = storage;
      return resolvedBrowserStorage;
    } catch {
      // try next storage candidate
    }
  }

  resolvedBrowserStorage = null;
  return resolvedBrowserStorage;
}

const safeStorage = {
  getItem: (key: string): string | null => {
    const browserStorage = getBrowserStorage();
    if (browserStorage) {
      try {
        const value = browserStorage.getItem(key);
        if (value !== null) {
          memoryStore.set(key, value);
        } else {
          // Key is genuinely absent in real storage (e.g. cleared externally) —
          // treat that as authoritative instead of returning a stale cached value.
          memoryStore.delete(key);
        }
        return value;
      } catch {
        // fall back to memory store
      }
    }

    return memoryStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    memoryStore.set(key, value);

    const browserStorage = getBrowserStorage();
    if (!browserStorage) {
      return;
    }

    try {
      browserStorage.setItem(key, value);
    } catch {
      // keep memory fallback only
    }
  },
  removeItem: (key: string): void => {
    memoryStore.delete(key);

    const browserStorage = getBrowserStorage();
    if (!browserStorage) {
      return;
    }

    try {
      browserStorage.removeItem(key);
    } catch {
      // ignore browser storage failures
    }
  },
  getJSON: <T>(key: string, fallback: T): T => {
    try {
      const item = safeStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  setJSON: <T>(key: string, value: T): void => {
    safeStorage.setItem(key, JSON.stringify(value));
  },
};

export default safeStorage;
