import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from '@/components/themed-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { AppButton, Field, ChoiceGroup } from '@/components/ui';
import { Pagination } from '@/components/pagination';
import { canUserAccessPath } from '@/config/navigation';
import { useAuth } from '@/contexts/auth-context';

export default function PropertiesScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const { ownerId } = useLocalSearchParams<{ ownerId?: string }>();
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState('all');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['properties', 'page', page, search, operation, ownerId],
    queryFn: () =>
      propertiesApi.getPage({
        page,
        ownerId,
        limit: 20,
        search,
        operation: operation === 'all' ? undefined : operation,
        order: 'newest',
      }),
  });
  return (
    <Screen guidanceReady={!query.isFetching} guidanceBlocked={query.isError}>
      <Field
        label={t('common.search')}
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder={t('guidance.properties.initial')}
        testID="properties.search"
      />
      <ChoiceGroup
        label={t('common.filter')}
        value={operation}
        onChange={(value) => {
          setOperation(value);
          setPage(1);
        }}
        options={[
          { value: 'all', label: t('interested.filters.allOperations') },
          { value: 'rent', label: t('interested.operations.rent') },
          { value: 'sale', label: t('interested.operations.sale') },
        ]}
      />
      {query.isLoading ? <ActivityIndicator /> : null}
      {query.isError ? (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>
            {query.error.message}
          </Text>
          <AppButton
            title={t('common.retry')}
            onPress={() => void query.refetch()}
          />
        </View>
      ) : null}
      <View style={styles.list}>
        {query.data?.data.map((property) => (
          <View key={property.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={property.name}
              testID={`property.view.${property.id}`}
              onPress={() =>
                router.push(`/(app)/properties/${property.id}` as never)
              }
            >
              <Text style={styles.title}>{property.name}</Text>
              <Text>{`${property.address.street} ${property.address.number}, ${property.address.city}`}</Text>
              <Text>{t(`properties.status.${property.status}`)}</Text>
            </Pressable>
            {user &&
            canUserAccessPath(user, `/properties/${property.id}/edit`) ? (
              <AppButton
                title={t('common.edit')}
                variant="secondary"
                onPress={() =>
                  router.push(`/(app)/properties/${property.id}/edit` as never)
                }
              />
            ) : null}
          </View>
        ))}
        {!query.isLoading && !query.isError && !query.data?.total ? (
          <Text>{t('common.noDataAvailable')}</Text>
        ) : null}
      </View>
      <Pagination
        result={query.data}
        loading={query.isFetching}
        onPage={setPage}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#fff',
  },
  title: { color: '#202832', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  error: { color: '#b42318', marginBottom: 8 },
});
