import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { API_URL, IS_E2E_MODE } from '@/api/env';
import { getToken } from '@/storage/auth-storage';

type DownloadOptions = {
  filenamePrefix: string;
  absoluteUrl?: string;
  relativePath?: string;
};

const sanitizeFilename = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

const resolveUrl = ({ absoluteUrl, relativePath }: DownloadOptions): string => {
  if (absoluteUrl) {
    return absoluteUrl;
  }

  if (!relativePath) {
    throw new Error('Missing download URL');
  }

  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }

  return `${API_URL}${relativePath}`;
};

export async function downloadAndSharePdf(options: DownloadOptions): Promise<string> {
  const token = await getToken();
  const url = resolveUrl(options);
  const filename = `${sanitizeFilename(options.filenamePrefix)}-${Date.now()}.pdf`;
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDir) {
    throw new Error('No writable filesystem directory is available');
  }

  const destination = `${baseDir}${filename}`;

  const result = await FileSystem.downloadAsync(url, destination, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (IS_E2E_MODE) {
    return result.uri;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: filename,
  });

  return result.uri;
}

export async function createAndShareMockPdf(filenamePrefix: string, body: string): Promise<string> {
  const filename = `${sanitizeFilename(filenamePrefix)}-${Date.now()}.pdf`;
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDir) {
    throw new Error('No writable filesystem directory is available');
  }

  const uri = `${baseDir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, body, {
    encoding: 'utf8',
  });

  if (IS_E2E_MODE) {
    return uri;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: filename,
    });
  }

  return uri;
}
