import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRoleNavigation } from '@/hooks/use-role-navigation';

const isEnabled = (allowed: string[], route: string) => allowed.includes(route);

export default function TabsLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const roleNavigation = useRoleNavigation();
  const allowedRoutes = roleNavigation.map((item) => item.href);
  const goDashboard = () => {
    router.replace('/(app)/(tabs)/dashboard' as never);
  };

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
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/properties') && (
        <Tabs.Screen
          name="properties"
          options={{
            title: t('properties.title'),
            tabBarButtonTestID: 'tab.properties',
            headerLeft: () => (
              <Pressable style={styles.headerBackButton} onPress={goDashboard} testID="header.back.properties">
                <Ionicons name="arrow-back" color="#0f172a" size={20} />
              </Pressable>
            ),
            headerRight: () => (
              <Pressable
                style={styles.headerActionButton}
                onPress={() => router.push('/(app)/owners/new' as never)}
                testID="owners.new"
              >
                <Text style={styles.headerActionText}>{t('breadcrumbs.new')}</Text>
              </Pressable>
            ),
            tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" color={color} size={size} />,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/tenants') && (
        <Tabs.Screen
          name="tenants"
          options={{
            title: t('tenants.title'),
            tabBarButtonTestID: 'tab.tenants',
            headerLeft: () => (
              <Pressable style={styles.headerBackButton} onPress={goDashboard} testID="header.back.tenants">
                <Ionicons name="arrow-back" color="#0f172a" size={20} />
              </Pressable>
            ),
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/interested') && (
        <Tabs.Screen
          name="interested"
          options={{
            title: t('interested.title'),
            tabBarButtonTestID: 'tab.interested',
            headerLeft: () => (
              <Pressable style={styles.headerBackButton} onPress={goDashboard} testID="header.back.interested">
                <Ionicons name="arrow-back" color="#0f172a" size={20} />
              </Pressable>
            ),
            headerRight: () => (
              <Pressable
                style={styles.headerActionButton}
                onPress={() => router.push('/(app)/interested/new' as never)}
                testID="interested.new"
              >
                <Text style={styles.headerActionText}>{t('breadcrumbs.new')}</Text>
              </Pressable>
            ),
            tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size} />,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/leases') && (
        <Tabs.Screen
          name="leases"
          options={{
            href: null,
            title: t('leases.title'),
            headerLeft: () => (
              <Pressable style={styles.headerBackButton} onPress={goDashboard} testID="header.back.leases">
                <Ionicons name="arrow-back" color="#0f172a" size={20} />
              </Pressable>
            ),
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/payments') && (
        <Tabs.Screen
          name="payments"
          options={{
            title: t('payments.title'),
            tabBarButtonTestID: 'tab.payments',
            headerLeft: () => (
              <Pressable style={styles.headerBackButton} onPress={goDashboard} testID="header.back.payments">
                <Ionicons name="arrow-back" color="#0f172a" size={20} />
              </Pressable>
            ),
            tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" color={color} size={size} />,
          }}
        />
      )}
      {isEnabled(allowedRoutes, '/ai') && (
        <Tabs.Screen
          name="ai"
          options={{
            title: t('common.aiAssistant'),
            tabBarButtonTestID: 'tab.ai',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />,
          }}
        />
      )}
      <Tabs.Screen
        name="settings"
        options={{
          title: t('common.settings'),
          tabBarButtonTestID: 'tab.settings',
          headerLeft: () => (
            <Pressable style={styles.headerBackButton} onPress={goDashboard} testID="header.back.settings">
              <Ionicons name="arrow-back" color="#0f172a" size={20} />
            </Pressable>
          ),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
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
