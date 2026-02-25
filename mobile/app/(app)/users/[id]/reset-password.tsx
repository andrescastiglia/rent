import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { Screen } from '@/components/screen';
import { AppButton, Field, H1 } from '@/components/ui';

export default function ResetUserPasswordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (nextPassword: string) => usersApi.resetPassword(id, nextPassword),
    onSuccess: (result) => {
      const message = result.temporaryPassword
        ? `${result.message}\n${t('users.newPasswordPrompt')} ${result.temporaryPassword}`
        : result.message;
      Alert.alert(t('users.messages.passwordReset'), message, [{ text: 'OK', onPress: () => router.back() }]);
    },
    onError: (submitError) => {
      Alert.alert(t('common.error'), submitError instanceof Error ? submitError.message : t('users.errors.resetPassword'));
    },
  });

  const handleSubmit = () => {
    const normalizedPassword = password.trim();
    if (normalizedPassword.length < 8) {
      setError(t('users.errors.passwordMinLength'));
      return;
    }
    setError(null);
    void mutation.mutateAsync(normalizedPassword);
  };

  return (
    <Screen>
      <H1>{t('users.resetPasswordDialog.title')}</H1>
      <View style={styles.card}>
        <Field
          label={t('userSettings.newPassword')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (error) setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          testID="userResetPassword.newPassword"
        />
        <Text style={styles.hint}>{t('users.resetPasswordDialog.hint')}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <AppButton
            title={t('common.cancel')}
            variant="secondary"
            onPress={() => router.back()}
            disabled={mutation.isPending}
            testID="userResetPassword.cancel"
          />
          <AppButton
            title={t('common.confirm')}
            onPress={handleSubmit}
            loading={mutation.isPending}
            disabled={mutation.isPending}
            testID="userResetPassword.submit"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 10,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 10,
  },
  actions: {
    gap: 10,
  },
});
