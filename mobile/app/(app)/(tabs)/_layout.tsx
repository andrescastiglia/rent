import { Pressable, Text } from '@/components/themed-native';
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { canUserAccessPath, getLandingPathForUser } from '@/config/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';

type TabBarIconProps = Readonly<{
  color: ComponentProps<typeof Ionicons>['color'];
  size: number;
  name: ComponentProps<typeof Ionicons>['name'];
}>;

type TabBarRenderProps = Readonly<{
  color: ComponentProps<typeof Ionicons>['color'];
  size: number;
  focused: boolean;
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
  const { colors } = useTheme();
  return (
    <Pressable
      style={styles.headerBackButton}
      onPress={onPress}
      testID={testID}
    >
      <Ionicons name="arrow-back" color={colors.text} size={20} />
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
  labelKey?: string;
  route: Href;
  testID: string;
}>;

function DashboardHeaderBackButton({ testID }: DashboardHeaderBackButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  return (
    <HeaderBackButton
      onPress={() => {
        const landingPath = getLandingPathForUser(user);
        router.replace(`/(app)/(tabs)${landingPath}` as never);
      }}
      testID={testID}
    />
  );
}

function NewRouteHeaderAction({
  route,
  testID,
  labelKey,
}: NewRouteHeaderActionProps) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <HeaderActionButton
      label={t(labelKey ?? 'breadcrumbs.new')}
      onPress={() => {
        router.push(route);
      }}
      testID={testID}
    />
  );
}

function DashboardTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="home-outline" />;
}

function PropertiesTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="business-outline" />;
}

function TenantsTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="people-outline" />;
}

function InterestedTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="sparkles-outline" />;
}

function PaymentsTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="card-outline" />;
}

function AiTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="chatbubble-ellipses-outline" />;
}

function SettingsTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="ellipsis-horizontal" />;
}
function TasksTabBarIcon(props: TabBarRenderProps) {
  return <TabBarIcon {...props} name="checkmark-circle-outline" />;
}

function PropertiesHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.properties" />;
}

function TenantsHeaderLeft() {
  return <DashboardHeaderBackButton testID="header.back.tenants" />;
}

function TenantsHeaderRight() {
  return (
    <NewRouteHeaderAction route="/(app)/tenants/new" testID="tenants.new" />
  );
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
  return (
    <NewRouteHeaderAction
      route="/(app)/properties/new"
      testID="properties.new"
      labelKey="properties.newProperty"
    />
  );
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerLeftContainerStyle: styles.headerLeftContainer,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('navigation.home'),
          tabBarButtonTestID: 'tab.home',
          tabBarIcon: DashboardTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t('navigation.tasks'),
          tabBarButtonTestID: 'tab.tasks',
          tabBarIcon: TasksTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('navigation.more'),
          tabBarButtonTestID: 'tab.more',
          tabBarIcon: SettingsTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('nav.dashboard'),
          href: null,
          tabBarIcon: DashboardTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          href: null,
          title: t('properties.title'),
          tabBarButtonTestID: 'tab.properties',
          headerLeft: PropertiesHeaderLeft,
          headerRight:
            user && canUserAccessPath(user, '/properties/new')
              ? PropertiesHeaderRight
              : undefined,
          tabBarIcon: PropertiesTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="tenants"
        options={{
          href: null,
          title: t('tenants.title'),
          tabBarButtonTestID: 'tab.tenants',
          headerLeft: TenantsHeaderLeft,
          headerRight:
            user && canUserAccessPath(user, '/tenants/new')
              ? TenantsHeaderRight
              : undefined,
          tabBarIcon: TenantsTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="interested"
        options={{
          href: null,
          title: t('interested.title'),
          tabBarButtonTestID: 'tab.interested',
          headerLeft: InterestedHeaderLeft,
          headerRight: InterestedHeaderRight,
          tabBarIcon: InterestedTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="leases"
        options={{
          href: null,
          title: t('leases.title'),
          headerLeft: LeasesHeaderLeft,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          href: null,
          title: t('payments.title'),
          tabBarButtonTestID: 'tab.payments',
          headerLeft: PaymentsHeaderLeft,
          tabBarIcon: PaymentsTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          href: null,
          title: t('common.aiAssistant'),
          tabBarButtonTestID: 'tab.ai',
          tabBarIcon: AiTabBarIcon,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '700',
  },
});
