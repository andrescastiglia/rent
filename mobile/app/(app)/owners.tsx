import { Text, View } from '@/components/themed-native';
import { useRouter } from 'expo-router';
import { AppButton } from '@/components/ui';
import { canUserAccessPath } from '@/config/navigation';
import { useAuth } from '@/contexts/auth-context';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { ModuleListScreen } from '@/components/module-list';
import type { Owner } from '@/types/owner';

export default function OwnersScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  return (
    <ModuleListScreen<Owner>
      title={t('properties.ownersTitle')}
      subtitle={t('properties.ownerListSubtitle')}
      queryKey={['owners']}
      queryFn={() =>
        user && canUserAccessPath(user, '/owners/new')
          ? ownersApi.getAll()
          : ownersApi.getMyProfile().then((owner) => [owner])
      }
      renderItem={(owner) => (
        <View style={styles.card}>
          <Text
            style={styles.title}
          >{`${owner.firstName} ${owner.lastName}`}</Text>
          <Text style={styles.detail}>{owner.email}</Text>
          {user && canUserAccessPath(user, `/owners/${owner.id}/edit`) ? (
            <AppButton
              title={t('common.edit')}
              variant="secondary"
              onPress={() =>
                router.push(`/(app)/owners/${owner.id}/edit` as never)
              }
            />
          ) : null}
          {user && canUserAccessPath(user, '/properties') ? (
            <AppButton
              title={t('nav.properties')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/(app)/(tabs)/properties',
                  params: { ownerId: owner.id },
                } as never)
              }
            />
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
  },
  detail: {
    color: '#475569',
  },
});
