export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_MESSAGE_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
const types = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/plain', csv: 'text/csv', tsv: 'text/plain', json: 'text/plain',
  log: 'text/plain', yaml: 'text/plain', yml: 'text/plain', xml: 'text/plain', html: 'text/plain',
  css: 'text/plain', js: 'text/plain', ts: 'text/plain', tsx: 'text/plain', jsx: 'text/plain',
  py: 'text/plain', r: 'text/plain', sql: 'text/plain', tex: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf',
};
export const attachmentAccept = Object.keys(types).map((ext) => `.${ext}`).join(',');
export function attachmentMetadata(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 240
    || /[\u0000-\u001f\u007f/\\]/.test(value.name)) throw new Error('Choose a file with a valid filename.');
  const ext = value.name.split('.').at(-1).toLowerCase();
  if (!Object.hasOwn(types, ext)) throw new Error('This file type is not supported yet. Use an image, PDF, text, Word, Excel or PowerPoint file.');
  if (!Number.isInteger(value.size) || value.size < 1 || value.size > MAX_FILE_BYTES) throw new Error('Files must be non-empty and no larger than 25 MB.');
  return { name: value.name, size: value.size, type: types[ext] };
}
export function parseAttachments(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new Error('Attach up to 5 files per message.');
  const files = value.map((file) => {
    if (!file || typeof file.id !== 'string' || !/^[a-f0-9-]{36}$/.test(file.id)
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid attachment.');
    return { id: file.id, ...attachmentMetadata(file), sha256: file.sha256 };
  });
  if (new Set(files.map((file) => file.id)).size !== files.length) throw new Error('A file can only be attached once.');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_MESSAGE_BYTES) throw new Error('Keep the total attachments under 50 MB.');
  return files;
}
export function savedAttachments(json) {
  try { return parseAttachments(json ? JSON.parse(json) : []); } catch { return []; }
}
export function fileSize(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
export function isPreviewImage(file) { return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type); }
