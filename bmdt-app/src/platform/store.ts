const STORE_PREFIX = 'bmdt_';

function storage(): Storage {
  try {
    const test = `${STORE_PREFIX}_test`;
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
    return localStorage;
  } catch {
    return new Map<string, string>() as unknown as Storage;
  }
}

const _storage = storage();

function key(k: string): string {
  return `${STORE_PREFIX}${k}`;
}

export function loadJSON<T>(name: string): T | null {
  try {
    const raw = _storage.getItem(key(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function saveJSON<T>(name: string, value: T): void {
  try { _storage.setItem(key(name), JSON.stringify(value)); }
  catch { /* storage full or unavailable */ }
}

export function removeItem(name: string): void {
  try { _storage.removeItem(key(name)); } catch { /* noop */ }
}

export function listKeys(prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < _storage.length; i++) {
      const k = _storage.key(i);
      if (k && k.startsWith(key(prefix))) keys.push(k.slice(STORE_PREFIX.length));
    }
  } catch { /* noop */ }
  return keys;
}
