/**
 * Upload rules, enforced on the server.
 *
 * The bucket applies the same size and type limits, so a caller bypassing this
 * form still cannot store something the rules forbid. This layer exists to give
 * a readable message instead of a storage error.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Extension is trusted only for display; the stored MIME type comes from the file. */
export const ALLOWED_MIME_TYPES: ReadonlyMap<string, string> = new Map([
  ['application/pdf', 'PDF'],
  ['application/msword', 'Word'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word'],
  ['application/vnd.ms-powerpoint', 'PowerPoint'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint'],
  ['application/vnd.ms-excel', 'Excel'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel'],
  ['image/png', 'Imagen'],
  ['image/jpeg', 'Imagen'],
  ['image/gif', 'Imagen'],
  ['image/webp', 'Imagen'],
  ['text/plain', 'Texto'],
  ['text/csv', 'CSV'],
  ['text/markdown', 'Markdown'],
]);

export function describeType(mimeType: string | null): string {
  if (mimeType === null) return 'Archivo';
  return ALLOWED_MIME_TYPES.get(mimeType) ?? 'Archivo';
}

/**
 * Makes a filename safe to use as a storage object name.
 *
 * Path separators and traversal segments are removed so a crafted name cannot
 * escape the owner's folder, and the result is length capped.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';

  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 100);

  return cleaned.length > 0 ? cleaned : 'archivo';
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
