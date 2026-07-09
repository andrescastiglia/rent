if (process.env.EXPO_PUBLIC_E2E_MODE === 'true') {
  const { enableScreens } = require('react-native-screens');
  enableScreens(false);
}

require('expo-router/entry');
