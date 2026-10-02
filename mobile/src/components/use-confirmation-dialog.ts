import { useState } from 'react';
import { Alert, type AlertButton, type AlertOptions } from 'react-native';

/** Keep contextual help quiet until the user resolves the native confirmation. */
export function useConfirmationDialog() {
  const [open, setOpen] = useState(false);
  return {
    open,
    confirm: (
      title: string,
      message: string,
      buttons: AlertButton[],
      options?: AlertOptions,
    ) => {
      setOpen(true);
      Alert.alert(
        title,
        message,
        buttons.map((button) => ({
          ...button,
          onPress: () => {
            setOpen(false);
            button.onPress?.();
          },
        })),
        {
          ...options,
          onDismiss: () => {
            setOpen(false);
            options?.onDismiss?.();
          },
        },
      );
    },
  };
}
