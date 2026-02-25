import * as ImagePicker from 'expo-image-picker';

import { API_URL, IS_MOCK_MODE } from '@/api/env';
import { getToken } from '@/storage/auth-storage';

export type UploadedAsset = {
  url: string;
  name: string;
  mimeType: string;
  size?: number;
};

const guessMimeType = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
};

export async function pickImageAssets(): Promise<ImagePicker.ImagePickerAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permiso de galería denegado');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.8,
  });

  if (result.canceled) {
    return [];
  }

  return result.assets;
}

export async function uploadAsset(asset: ImagePicker.ImagePickerAsset): Promise<UploadedAsset> {
  const fileName = asset.fileName ?? `upload-${Date.now()}`;
  const mimeType = asset.mimeType ?? guessMimeType(asset.uri);

  if (IS_MOCK_MODE) {
    return {
      url: asset.uri,
      name: fileName,
      mimeType,
      size: asset.fileSize ?? undefined,
    };
  }

  const token = await getToken();
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const response = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const fallback = response.statusText || 'Upload failed';
    const payload = await response.json().catch(() => ({ message: fallback }));
    throw new Error(payload.message ?? fallback);
  }

  const payload = await response.json().catch(() => null);
  const url = payload?.url ?? payload?.fileUrl ?? payload?.data?.url;
  if (!url) {
    throw new Error('Upload response did not include file URL');
  }

  return {
    url,
    name: fileName,
    mimeType,
    size: asset.fileSize ?? undefined,
  };
}

export async function pickAndUploadImages(): Promise<UploadedAsset[]> {
  const assets = await pickImageAssets();
  if (assets.length === 0) {
    return [];
  }

  const uploaded: UploadedAsset[] = [];
  for (const asset of assets) {
    uploaded.push(await uploadAsset(asset));
  }
  return uploaded;
}
