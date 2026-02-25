import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { Screen } from '@/components/screen';
import { AppButton, Field, H1 } from '@/components/ui';

export default function EditOwnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const ownerQuery = useQuery({
    queryKey: ['owners', id],
    queryFn: () => ownersApi.getById(id),
    enabled: Boolean(id),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!ownerQuery.data) {
      return;
    }

    setFirstName(ownerQuery.data.firstName ?? '');
    setLastName(ownerQuery.data.lastName ?? '');
    setEmail(ownerQuery.data.email ?? '');
    setPhone(ownerQuery.data.phone ?? '');
  }, [ownerQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!id) {
        throw new Error(t('common.error'));
      }
      if (!firstName.trim() || !lastName.trim() || !email.trim()) {
        throw new Error(t('validation.required'));
      }

      return ownersApi.update(id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['owners'] });
      await queryClient.invalidateQueries({ queryKey: ['owners', id] });
      router.back();
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen>
      <H1>{t('properties.editOwnerTitle')}</H1>
      {ownerQuery.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {ownerQuery.error ? <Text style={styles.error}>{(ownerQuery.error as Error).message}</Text> : null}

      <Field label={t('properties.ownerFields.firstName')} value={firstName} onChangeText={setFirstName} testID="ownerEdit.firstName" />
      <Field label={t('properties.ownerFields.lastName')} value={lastName} onChangeText={setLastName} testID="ownerEdit.lastName" />
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="ownerEdit.email"
      />
      <Field label={t('properties.ownerFields.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="ownerEdit.phone" />

      <View style={styles.actions}>
        <AppButton title={t('common.save')} onPress={() => mutation.mutate()} loading={mutation.isPending} testID="ownerEdit.submit" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
  actions: {
    marginTop: 8,
  },
});
