export function getFileCategory(mimeType='') {
  if (mimeType.startsWith('image/'))       return 'image';
  if (mimeType.startsWith('video/'))       return 'video';
  if (mimeType.startsWith('audio/'))       return 'audio';
  if (mimeType === 'application/pdf')      return 'pdf';
  if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel') return 'data';
  return 'file';
}
