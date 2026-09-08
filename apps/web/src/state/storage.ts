/**
 * localStorage бывает недоступен: приватный режим, запрет cookies, превью. Приложение
 * должно работать и без него — просто не помнит состояние между визитами.
 */
export function load<T>(key: string, parse: (raw: unknown) => T | undefined): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Хранилище недоступно или переполнено — состояние живёт до перезагрузки страницы.
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
