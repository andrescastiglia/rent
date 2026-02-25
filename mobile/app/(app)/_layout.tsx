import { Redirect, Stack, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/auth-context';

export default function ProtectedLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="properties/new" options={{ title: t('properties.newProperty') }} />
      <Stack.Screen name="properties/[id]/index" options={{ title: t('properties.propertyDetails') }} />
      <Stack.Screen name="properties/[id]/edit" options={{ title: t('properties.editProperty') }} />
      <Stack.Screen name="properties/[id]/maintenance/new" options={{ title: t('properties.saveMaintenanceTask') }} />
      <Stack.Screen name="tenants/new" options={{ title: t('tenants.newTenant') }} />
      <Stack.Screen name="tenants/[id]/index" options={{ title: t('tenants.tenantDetails') }} />
      <Stack.Screen name="tenants/[id]/edit" options={{ title: t('tenants.editTenant') }} />
      <Stack.Screen name="tenants/[id]/payments/new" options={{ title: t('tenants.paymentRegistration.title') }} />
      <Stack.Screen name="tenants/[id]/activities/new" options={{ title: t('tenants.activities.add') }} />
      <Stack.Screen name="leases/new" options={{ title: t('leases.newLease') }} />
      <Stack.Screen name="leases/[id]/index" options={{ title: t('leases.leaseDetails') }} />
      <Stack.Screen name="leases/[id]/edit" options={{ title: t('leases.editLease') }} />
      <Stack.Screen name="payments/new" options={{ title: t('payments.newPayment') }} />
      <Stack.Screen name="payments/[id]/index" options={{ title: t('payments.paymentDetails') }} />
      <Stack.Screen name="invoices" options={{ title: t('invoices.title') }} />
      <Stack.Screen name="invoices/[id]/index" options={{ title: t('invoices.invoiceDetails') }} />
      <Stack.Screen name="interested/new" options={{ title: t('interested.newTitle') }} />
      <Stack.Screen name="interested/[id]/index" options={{ title: t('interested.title') }} />
      <Stack.Screen name="interested/[id]/edit" options={{ title: t('interested.editTitle') }} />
      <Stack.Screen name="interested/[id]/activities/new" options={{ title: t('interested.activities.add') }} />
      <Stack.Screen
        name="users"
        options={{
          title: t('users.title'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(app)/users/new' as never)}
              testID="users.new"
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 14 }}>{t('breadcrumbs.new')}</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="users/new" options={{ title: t('users.newUser') }} />
      <Stack.Screen name="users/[id]/index" options={{ title: t('users.userDetails') }} />
      <Stack.Screen name="users/[id]/edit" options={{ title: t('common.edit') }} />
      <Stack.Screen name="reports" options={{ title: t('reports.title') }} />
      <Stack.Screen
        name="templates"
        options={{
          title: t('templatesHub.listTitle'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(app)/templates/new' as never)}
              testID="templates.new"
              style={{ paddingHorizontal: 6, paddingVertical: 4 }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 14 }}>{t('breadcrumbs.new')}</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="templates/new" options={{ title: t('templatesHub.newTemplate') }} />
      <Stack.Screen name="templates/[kind]/[id]/index" options={{ title: t('templatesHub.listTitle') }} />
      <Stack.Screen name="templates/[kind]/[id]/edit" options={{ title: t('templatesHub.editTemplate') }} />
      <Stack.Screen name="sales" options={{ title: t('sales.title') }} />
      <Stack.Screen name="owners" options={{ title: t('properties.ownersTitle') }} />
      <Stack.Screen name="owners/new" options={{ title: t('properties.createOwnerTitle') }} />
      <Stack.Screen name="owners/[id]/edit" options={{ title: t('properties.editOwnerTitle') }} />
      <Stack.Screen name="owners/[id]/pay" options={{ title: t('properties.ownerPay') }} />
    </Stack>
  );
}
