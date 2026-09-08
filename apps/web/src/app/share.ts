import type { Project } from '../state/project';

/**
 * Проект целиком в ссылке: сервера нет, а crontab — несколько килобайт текста.
 * base64url поверх UTF-8, потому что btoa не принимает кириллицу в комментариях.
 */
export function encodeShare(project: Project): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ t: project.title, s: project.text, z: project.timeZone, p: project.threshold, y: project.system }));
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(encoded: string): Omit<Project, 'id'> | undefined {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof raw !== 'object' || raw === null) {
      return undefined;
    }
    const { t, s, z, p, y } = raw as Record<string, unknown>;
    if (typeof t !== 'string' || typeof s !== 'string' || typeof z !== 'string' || typeof p !== 'number') {
      return undefined;
    }
    return { title: t, text: s, timeZone: z, threshold: p, system: y === true };
  } catch {
    return undefined;
  }
}

export function sharedFromLocation(): Omit<Project, 'id'> | undefined {
  const query = location.hash.split('?')[1];
  const encoded = query ? new URLSearchParams(query).get('p') : null;
  return encoded ? decodeShare(encoded) : undefined;
}
