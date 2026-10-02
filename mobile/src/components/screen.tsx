import {
  KeyboardAvoidingView,
  ScrollView,
  View,
} from '@/components/themed-native';
import {
  GuidanceInteractionContext,
  GuidanceControlsContext,
  GuidanceMessage,
  useScreenGuidance,
} from '@/components/guidance';
import { designTokens as tokens } from '@/config/design-tokens';
import { useTheme } from '@/contexts/theme-context';
import { PropsWithChildren, useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{
  guidanceReady?: boolean;
  guidanceBlocked?: boolean;
  padded?: boolean;
  scrollable?: boolean;
  scrollViewTestID?: string;
}>;

export function Screen({
  children,
  guidanceReady = true,
  guidanceBlocked = false,
  padded = true,
  scrollable = true,
  scrollViewTestID,
}: ScreenProps) {
  const { colors } = useTheme();
  const guidance = useScreenGuidance({
    ready: guidanceReady,
    blocked: guidanceBlocked,
  });
  const activeId = guidance.visible ? (guidance.target?.id ?? null) : null;
  const registry = useMemo(
    () => ({ register: guidance.register, activeId }),
    [guidance.register, activeId],
  );
  const content = (
    <View
      style={[
        styles.content,
        !scrollable && styles.fill,
        padded && styles.padded,
      ]}
    >
      <GuidanceControlsContext.Provider value={registry}>
        <GuidanceInteractionContext.Provider value={guidance.interact}>
          <View
            onTouchStart={guidance.interact}
            style={!scrollable && styles.fill}
          >
            {children}
          </View>
        </GuidanceInteractionContext.Provider>
      </GuidanceControlsContext.Provider>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scrollable ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={guidance.interact}
            testID={scrollViewTestID}
            contentContainerStyle={styles.scrollContent}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
        <GuidanceMessage guidance={guidance} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
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
