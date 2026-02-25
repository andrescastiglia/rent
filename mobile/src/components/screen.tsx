import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{
  padded?: boolean;
  scrollable?: boolean;
  scrollViewTestID?: string;
}>;

export function Screen({ children, padded = true, scrollable = true, scrollViewTestID }: ScreenProps) {
  const content = (
    <View style={[styles.content, !scrollable && styles.fill, padded && styles.padded]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {scrollable ? (
        <ScrollView testID={scrollViewTestID} contentContainerStyle={styles.scrollContent}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f8fa',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
  },
  fill: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
