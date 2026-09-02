import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { getLandingPathForRole } from '@/config/navigation';

export default function IndexRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (user) {
    const landingPath = getLandingPathForRole(user.role);
    return <Redirect href={`/(app)/(tabs)${landingPath}` as Href} />;
  }

  return <Redirect href="/(auth)/login" />;
}
