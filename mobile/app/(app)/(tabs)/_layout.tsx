import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRoleNavigation } from '@/hooks/use-role-navigation';

const isEnabled = (allowed: string[], route: string) => allowed.includes(route);

type TabBarIconProps = Readonly<{
  color: string;
  size: number;
  name: ComponentProps<typeof Ionicons>['name'];
}>;

type HeaderBackButtonProps = Readonly<{
  onPress: () => void;
  testID: string;
}>;

type HeaderActionButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  testID: string;
}>;

function TabBarIcon({ color, size, name }: TabBarIconProps) {
  return <Ionicons name={name} color={color} size={size} />;
}

function HeaderBackButton({ onPress, testID }: HeaderBackButtonProps) {
  return (
    <Pressable
      style={styles.headerBackButton}
      onPress={onPress}
      testID={testID}
    >
      <Ionicons name="arrow-back" color="#0f172a" size={20} />
    </Pressable>
  );
}

function HeaderActionButton({
  label,
  onPress,
  testID,
}: HeaderActionButtonProps) {
  return (
    <Pressable
      style={styles.headerActionButton}
      onPress={onPress}
      testID={testID}
    >
      <Text style={styles.headerActionText}>{label}</Text>
    </Pressable>
  );
}

type DashboardHeaderBackButtonProps = Readonly<{
  testID: string;
}>;

type NewRouteHeaderActionProps = Readonly<{
  route: Href;
  testID: string;
}>;

function DashboardHeaderBackButton({ testID }: DashboardHeaderBackButtonProps) {
  const router = useRouter();
  return (
    <HeaderBackButton
      onPress={() => {
        router.replace('/(app)/(tabs)/dashboard');
      }}
      testID={testID}
    />
  );
}

function NewRouteHeaderAction({ route, testID }: NewRouteHeaderActionProps) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <HeaderActionButton
      label={t('breadcrumbs.new')}
      onPress={() => {
        router.push(route);
      }}
      testID={testID}
    />
  );
}

function DashboardTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="home-outline" />;
}

function PropertiesTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="business-outline" />;
}

function TenantsTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="people-outline" />;
}

function InterestedTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="sparkles-outline" />;
}

function PaymentsTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="card-outline" />;
}

function AiTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="chatbubble-ellipses-outline" />;
}

function SettingsTabBarIcon(props: Omit<TabBarIconProps, 'name'>) {
  return <TabBarIcon {...props} name="settings-outline" />;
}

function PropertiesHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.properties" />;
}

function TenantsHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.tenants" />;
}

function InterestedHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.interested" />;
}

function LeasesHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.leases" />;
}

function PaymentsHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.payments" />;
}

function SettingsHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.settings" />;
}

function PropertiesHeaderRight() {
  return <NewRouteHeaderAction route="/(app)/owners/new" testID="owners.new" />;
}

function InterestedHeaderRight() {
  return (
    <NewRouteHeaderAction
      route="/(app)/interested/new"
      testID="interested.new"
    />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const roleNavigation = useRoleNavigation();
  const allowedRoutes = roleNavigation.map((item) => item.href);

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'left',
        headerLeftContainerStyle: styles.headerLeftContainer,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      {isEnabled(allowedRoutes, '/dashboard') && (
        <Tabs.Screen
          name="dashboard"
          options={{
            title: t('nav.dashboard'),
            href: null,
            tabBarIcon: DashboardTabBarIcon,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/properties') && (
        <Tabs.Screen
          name="properties"
          options={{
            title: t('properties.title'),
            tabBarButtonTestID: 'tab.properties',
            headerLeft: PropertiesHeaderLeft,
            headerRight: PropertiesHeaderRight,
            tabBarIcon: PropertiesTabBarIcon,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/tenants') && (
        <Tabs.Screen
          name="tenants"
          options={{
            title: t('tenants.title'),
            tabBarButtonTestID: 'tab.tenants',
            headerLeft: TenantsHeaderLeft,
            tabBarIcon: TenantsTabBarIcon,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/interested') && (
        <Tabs.Screen
          name="interested"
          options={{
            title: t('interested.title'),
            tabBarButtonTestID: 'tab.interested',
            headerLeft: InterestedHeaderLeft,
            headerRight: InterestedHeaderRight,
            tabBarIcon: InterestedTabBarIcon,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/leases') && (
        <Tabs.Screen
          name="leases"
          options={{
            href: null,
            title: t('leases.title'),
            headerLeft: LeasesHeaderLeft,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/payments') && (
        <Tabs.Screen
          name="payments"
          options={{
            title: t('payments.title'),
            tabBarButtonTestID: 'tab.payments',
            headerLeft: PaymentsHeaderLeft,
            tabBarIcon: PaymentsTabBarIcon,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/ai') && (
        <Tabs.Screen
          name="ai"
          options={{
            title: t('common.aiAssistant'),
            tabBarButtonTestID: 'tab.ai',
            tabBarIcon: AiTabBarIcon,
          }}
        />
      )}
      <Tabs.Screen
        name="settings"
        options={{
          title: t('common.settings'),
          tabBarButtonTestID: 'tab.settings',
          headerLeft: SettingsHeaderLeft,
          tabBarIcon: SettingsTabBarIcon,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerLeftContainer: {
    paddingLeft: 8,
  },
  headerTitle: {
    marginLeft: 2,
  },
  headerBackButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerActionText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '700',
  },
});
