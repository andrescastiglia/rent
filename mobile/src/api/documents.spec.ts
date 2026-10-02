import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { downloadAndSharePdf, createAndShareMockPdf } from './pdf';
import {
  discardUploadedAssets,
  pickAndUploadImages,
  pickImageAssets,
  uploadAsset,
} from './uploads';
import { apiClient } from './client';
import * as env from './env';
import { getToken } from '@/storage/auth-storage';

jest.mock('./env', () => ({
  __esModule: true,
  API_URL: 'https://rent.example/api',
  IS_MOCK_MODE: false,
  IS_E2E_MODE: false,
}));
jest.mock('@/storage/auth-storage', () => ({
  getToken: jest.fn(async () => 'stored-token'),
}));
const originalFormData = globalThis.FormData;
class NativeFormData {
  parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}
const asset: ImagePicker.ImagePickerAsset = {
  uri: 'file:///picture.png',
  fileName: 'picture.png',
  fileSize: 120,
  width: 300,
  height: 200,
};
beforeEach(() => {
  globalThis.FormData = NativeFormData as unknown as typeof FormData;
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({
    uri: 'file:///cache/receipt.pdf',
    status: 200,
    headers: {},
    mimeType: 'application/pdf',
  });
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(getToken).mockResolvedValue('stored-token');
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as never);
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: true, assets: null });
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      url: 'https://rent.example/api/properties/images/staged',
    }),
  })) as jest.Mock;
});
afterEach(() => {
  jest.restoreAllMocks();
  globalThis.FormData = originalFormData;
});
it('downloads a recoverable document with credentials only for the application origin and shares the actual file', async () => {
  expect(
    await downloadAndSharePdf({
      filenamePrefix: '../../INV Number 1',
      relativePath: '/invoices/i1/pdf',
    }),
  ).toBe('file:///cache/receipt.pdf');
  expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
    'https://rent.example/api/invoices/i1/pdf',
    expect.stringMatching(/^file:\/\/\/cache\/inv-number-1-\d+\.pdf$/),
    { headers: { Authorization: 'Bearer stored-token' } },
  );
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    'file:///cache/receipt.pdf',
    expect.objectContaining({ mimeType: 'application/pdf' }),
  );
});
it('never forwards the bearer token to a third-party document URL', async () => {
  await downloadAndSharePdf({
    filenamePrefix: 'receipt',
    absoluteUrl: 'https://storage.example/receipt.pdf',
  });
  expect(FileSystem.downloadAsync).toHaveBeenLastCalledWith(
    'https://storage.example/receipt.pdf',
    expect.any(String),
    { headers: undefined },
  );
  jest.mocked(getToken).mockResolvedValue(null);
  await downloadAndSharePdf({
    filenamePrefix: 'receipt',
    relativePath: 'https://rent.example/api/doc.pdf',
  });
  expect(FileSystem.downloadAsync).toHaveBeenLastCalledWith(
    'https://rent.example/api/doc.pdf',
    expect.any(String),
    { headers: undefined },
  );
});
it('rejects a failed document response, deletes it and does not share it', async () => {
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({
    uri: 'file:///cache/error.pdf',
    status: 403,
    headers: {},
    mimeType: 'application/json',
  });
  jest
    .mocked(FileSystem.deleteAsync)
    .mockRejectedValue(new Error('Already deleted'));
  await expect(
    downloadAndSharePdf({ filenamePrefix: 'receipt', relativePath: '/pdf' }),
  ).rejects.toThrow('HTTP 403');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///cache/error.pdf',
    { idempotent: true },
  );
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
it('fails clearly when a document URL or writable directory is unavailable', async () => {
  await expect(
    downloadAndSharePdf({ filenamePrefix: 'receipt' }),
  ).rejects.toThrow('Missing download URL');
  jest.replaceProperty(FileSystem, 'cacheDirectory', null);
  jest.replaceProperty(FileSystem, 'documentDirectory', null);
  await expect(
    downloadAndSharePdf({ filenamePrefix: 'receipt', relativePath: '/pdf' }),
  ).rejects.toThrow('No writable filesystem');
  await expect(createAndShareMockPdf('test', 'body')).rejects.toThrow(
    'No writable filesystem',
  );
});
it('uses the document directory fallback and reports an unavailable sharing service', async () => {
  jest.replaceProperty(FileSystem, 'cacheDirectory', null);
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await expect(
    downloadAndSharePdf({ filenamePrefix: 'receipt', relativePath: '/pdf' }),
  ).rejects.toThrow('Sharing is not available');
  expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining('file:///documents/receipt-'),
    expect.any(Object),
  );
});
it('returns downloaded artifacts without opening sharing UI during E2E', async () => {
  jest.replaceProperty(env, 'IS_E2E_MODE', true);
  await downloadAndSharePdf({
    filenamePrefix: 'receipt',
    relativePath: '/pdf',
  });
  await createAndShareMockPdf('mock', 'receipt body');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
it('writes deterministic mock document content and handles devices without sharing', async () => {
  const uri = await createAndShareMockPdf('Mock Receipt', 'receipt body');
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
    uri,
    'receipt body',
    { encoding: 'utf8' },
  );
  expect(Sharing.shareAsync).toHaveBeenCalled();
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  await createAndShareMockPdf('another', 'body');
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
it('distinguishes gallery denial and cancellation from selected assets', async () => {
  expect(await pickImageAssets()).toEqual([]);
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: false } as never);
  await expect(pickImageAssets()).rejects.toThrow(
    'Permiso de galería denegado',
  );
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as never);
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: false, assets: [asset] });
  expect(await pickImageAssets()).toEqual([asset]);
});
it('uploads multipart property images to the actual property endpoint without inventing a content type header', async () => {
  expect(await uploadAsset(asset)).toEqual({
    url: 'https://rent.example/api/properties/images/staged',
    name: 'picture.png',
    mimeType: 'image/png',
    size: 120,
  });
  expect(fetch).toHaveBeenCalledWith(
    'https://rent.example/api/properties/upload',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer stored-token' },
      body: expect.any(NativeFormData),
    },
  );
  expect(
    (jest.mocked(fetch).mock.calls[0][1]?.body as unknown as NativeFormData)
      .parts,
  ).toEqual([
    ['file', { uri: asset.uri, name: 'picture.png', type: 'image/png' }],
  ]);
});
it.each([
  ['file.webp', 'image/webp'],
  ['file.pdf', 'application/pdf'],
  ['file.jpeg', 'image/jpeg'],
])(
  'infers MIME for %s and accepts documented response URLs',
  async (uri, mimeType) => {
    jest.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: 'staged' } }),
    } as Response);
    jest.mocked(getToken).mockResolvedValue(null);
    const result = await uploadAsset({
      ...asset,
      uri,
      fileName: null,
      fileSize: undefined,
    });
    expect(result.mimeType).toBe(mimeType);
    expect(result.name).toMatch(/^upload-/);
    expect(result.url).toBe('staged');
  },
);
it('reports missing upload URLs and preserves server validation errors', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);
  await expect(uploadAsset(asset)).rejects.toThrow('did not include file URL');
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    statusText: 'Bad request',
    json: async () => ({ message: 'Only images allowed' }),
  } as Response);
  await expect(uploadAsset(asset)).rejects.toThrow('Only images allowed');
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    statusText: '',
    json: async () => {
      throw new Error('Invalid JSON');
    },
  } as unknown as Response);
  await expect(uploadAsset(asset)).rejects.toThrow('Upload failed');
});
it('discards staged files after a later upload failed, without swallowing the original failure', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [asset, { ...asset, uri: 'file:///second.png' }],
  });
  jest
    .mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ fileUrl: 'first-staged-url' }),
    } as Response)
    .mockRejectedValueOnce(new Error('Interrupted upload'));
  const discard = jest
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ deleted: 1 });
  await expect(pickAndUploadImages()).rejects.toThrow('Interrupted upload');
  expect(discard).toHaveBeenCalledWith('/properties/uploads/discard', {
    images: ['first-staged-url'],
  });
});
it('handles an empty image selection and the mock upload path without remote mutations', async () => {
  const discard = jest.spyOn(apiClient, 'post');
  expect(await pickAndUploadImages()).toEqual([]);
  await discardUploadedAssets([]);
  expect(discard).not.toHaveBeenCalled();
  jest.replaceProperty(env, 'IS_MOCK_MODE', true);
  expect(await uploadAsset({ ...asset, mimeType: 'image/custom' })).toEqual({
    url: asset.uri,
    name: 'picture.png',
    mimeType: 'image/custom',
    size: 120,
  });
  await discardUploadedAssets([asset.uri]);
  expect(discard).not.toHaveBeenCalled();
});
it('returns all successfully uploaded images in selection order', async () => {
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: false, assets: [asset] });
  expect(await pickAndUploadImages()).toHaveLength(1);
});
