import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { Screen } from '@/components/screen';
import { AppButton, Field, H1 } from '@/components/ui';

export default function NewOwnerScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !lastName.trim() || !email.trim()) {
        throw new Error(t('validation.required'));
      }

      return ownersApi.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['owners'] });
      router.replace('/(app)/(tabs)/properties');
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen>
      <H1>{t('properties.createOwnerTitle')}</H1>
      <Field label={t('properties.ownerFields.firstName')} value={firstName} onChangeText={setFirstName} testID="ownerCreate.firstName" />
      <Field label={t('properties.ownerFields.lastName')} value={lastName} onChangeText={setLastName} testID="ownerCreate.lastName" />
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="ownerCreate.email"
      />
      <Field label={t('properties.ownerFields.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="ownerCreate.phone" />

      <View style={styles.actions}>
        <AppButton
          title={t('properties.addOwner')}
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          testID="ownerCreate.submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    marginTop: 8,
  },
});
