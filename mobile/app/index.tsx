import { ActivityIndicator, View } from '@/components/themed-native';
import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { getLandingPathForUser } from '@/config/navigation';

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
    const landingPath = getLandingPathForUser(user);
    return <Redirect href={`/(app)/(tabs)${landingPath}` as Href} />;
  }

  return <Redirect href="/(auth)/login" />;
}
