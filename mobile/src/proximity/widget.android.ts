import { requireOptionalNativeModule } from 'expo-modules-core';
import type { WidgetSnapshot } from '../../../shared/proximity';
const native = requireOptionalNativeModule<{
  update: (snapshot: string) => void;
}>('RentProximity');
export const nativeWidgetAvailable = Boolean(native);
export function updateWidget(snapshot: WidgetSnapshot): void {
  native?.update(JSON.stringify(snapshot));
}
