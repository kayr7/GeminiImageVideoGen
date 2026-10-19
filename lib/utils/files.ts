/** Read a File/Blob as a full data URL (data:<mime>;base64,...). */
export const readFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

/** Strip the `data:<mime>;base64,` prefix from a data URL. */
export const stripDataUrlPrefix = (dataUrl: string): string => dataUrl.split(',')[1] ?? '';

/** Trigger a browser download for the given URL (or data URL). */
export const downloadFromUrl = (url: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** Extract a human readable error message from an API error payload. */
export const getApiErrorMessage = (data: unknown, fallback: string): string => {
  const payload = data as { detail?: unknown; error?: { message?: string } } | null | undefined;
  if (typeof payload?.detail === 'string' && payload.detail) return payload.detail;
  return payload?.error?.message || fallback;
};

export const formatDateTime = (value: string | number | Date): string =>
  new Date(value).toLocaleString();

export const formatDate = (value: string | number | Date): string =>
  new Date(value).toLocaleDateString();
