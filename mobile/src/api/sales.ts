import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type { SaleFolder } from '@/types/sales';

const MOCK_SALE_FOLDERS: SaleFolder[] = [
  {
    id: 'folder-1',
    name: 'Loteo Las Palmas',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const salesApi = {
  async getFolders(): Promise<SaleFolder[]> {
    if (IS_MOCK_MODE) {
      return MOCK_SALE_FOLDERS;
    }

    return apiClient.get<SaleFolder[]>('/sales/folders');
  },
};
