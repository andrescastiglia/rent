import { Pressable, Text, View } from '@/components/themed-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'expo-router';
import { AccessibilityInfo, Keyboard, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useTranslation } from 'react-i18next';
import {
  chooseGuidance,
  selectGuidanceControl,
  type GuidanceControl,
} from '@/config/guidance';
import { designTokens as tokens } from '@/config/design-tokens';

export const GuidanceInteractionContext = createContext<() => void>(
  () => undefined,
);
export function useGuidanceInteraction() {
  return useContext(GuidanceInteractionContext);
}

type Registry = {
  register: (control: GuidanceControl) => () => void;
  activeId: string | null;
};
export const GuidanceControlsContext = createContext<Registry>({
  register: () => () => undefined,
  activeId: null,
});
export function useGuidanceControl(control: GuidanceControl) {
  const { register, activeId } = useContext(GuidanceControlsContext);
  const { id, label, kind, enabled, complete, blocking } = control;
  useEffect(
    () => register({ id, label, kind, enabled, complete, blocking }),
    [register, id, label, kind, enabled, complete, blocking],
  );
  return activeId === id;
}
export function useGuidanceBlocker(id: string, blocking: boolean) {
  useGuidanceControl({
    id,
    label: '',
    kind: 'blocker',
    enabled: false,
    complete: false,
    blocking,
  });
}
export function GuidanceControlHint({
  active,
  label,
}: Readonly<{ active: boolean; label: string }>) {
  const { t } = useTranslation();
  return active ? (
    <Text accessibilityLiveRegion="polite" style={styles.controlHint}>
      {t('guidance.control', { control: label })}
    </Text>
  ) : null;
}

export function useScreenGuidance({
  ready = true,
  blocked = false,
}: {
  ready?: boolean;
  blocked?: boolean;
}) {
  const path = usePathname();
  const [controls, setControls] = useState(new Map<string, GuidanceControl>());
  const register = useCallback((control: GuidanceControl) => {
    setControls((current) => new Map(current).set(control.id, control));
    return () =>
      setControls((current) => {
        const next = new Map(current);
        next.delete(control.id);
        return next;
      });
  }, []);
  const target = selectGuidanceControl(path, [...controls.values()]);
  const controlBlocked = [...controls.values()].some(
    (control) => control.blocking,
  );
  const targetId = target?.id ?? null;
  const targetReady = controls.size === 0 || Boolean(target);
  const [interaction, setInteraction] = useState(0);
  const [paused, setPaused] = useState(true);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [visible, setVisible] =
    useState<ReturnType<typeof chooseGuidance>>(null);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync('rent.help.paused')
      .then((value) => {
        if (mounted) {
          initialized.current = true;
          setPaused(value === 'true');
        }
      })
      .catch(() => {
        if (mounted) {
          initialized.current = true;
          setPaused(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    setInteraction(0);
    setVisible(null);
    seen.current.clear();
  }, [path]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardOpen(true);
      setVisible(null);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    setVisible(null);
    const suggestion = chooseGuidance(path, {
      ready: ready && initialized.current && targetReady,
      blocked: blocked || keyboardOpen || controlBlocked,
      paused,
      started: interaction > 0,
      seen: new Set(
        [...seen.current]
          .filter((key) => key.endsWith(`:${targetId}`))
          .map((key) => key.slice(0, -(String(targetId).length + 1))),
      ),
    });
    if (!suggestion) return;
    const timeout = setTimeout(() => {
      seen.current.add(`${suggestion.key}:${targetId}`);
      setVisible(suggestion);
    }, suggestion.delay);
    return () => clearTimeout(timeout);
  }, [
    path,
    ready,
    blocked,
    paused,
    interaction,
    keyboardOpen,
    controlBlocked,
    targetId,
    targetReady,
  ]);
  return {
    visible,
    target,
    register,
    paused,
    keyboardOpen,
    dismiss: () => setVisible(null),
    togglePause: () => {
      const next = !paused;
      setPaused(next);
      setVisible(null);
      void SecureStore.setItemAsync('rent.help.paused', String(next)).catch(
        () => undefined,
      );
    },
    interact: () => {
      setVisible(null);
      setInteraction((value) => value + 1);
    },
  };
}

export function GuidanceMessage({
  guidance,
}: Readonly<{ guidance: ReturnType<typeof useScreenGuidance> }>) {
  const { t } = useTranslation();
  const targetSuffix = guidance.target ? ` · ${guidance.target.label}` : '';
  const message = guidance.visible
    ? t(`guidance.${guidance.visible.module}.${guidance.visible.stage}`) +
      targetSuffix
    : '';
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <View style={styles.container}>
      {guidance.visible ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Text style={styles.title}>{t('guidance.title')}</Text>
          <Text style={styles.text}>{message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('guidance.close')}
            onPress={guidance.dismiss}
            style={styles.control}
          >
            <Text>{t('guidance.close')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            guidance.paused ? 'guidance.resume' : 'guidance.pause',
          )}
          onPress={guidance.togglePause}
          style={styles.preference}
        >
          <Text style={styles.preferenceText}>
            {t(guidance.paused ? 'guidance.resume' : 'guidance.pause')}
          </Text>
        </Pressable>
        {guidance.keyboardOpen ? (
          <Pressable
            testID="screen.dismissKeyboard"
            accessibilityRole="button"
            accessibilityLabel={t('common.dismissKeyboard')}
            onPress={Keyboard.dismiss}
            style={styles.preference}
          >
            <Text style={styles.preferenceText}>
              {t('common.dismissKeyboard')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  controlHint: {
    color: tokens.colors.primary,
    backgroundColor: tokens.colors.help,
    padding: 8,
    borderRadius: 8,
    fontSize: 14,
  },
  container: { paddingTop: 8 },
  controls: { flexDirection: 'row', justifyContent: 'space-between' },
  message: {
    padding: tokens.space.sm,
    backgroundColor: tokens.colors.help,
    borderRadius: tokens.radius.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: 8,
  },
  title: { fontWeight: '700', color: tokens.colors.text },
  text: { color: tokens.colors.text, fontSize: tokens.typography.body },
  control: {
    minHeight: tokens.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  preference: { minHeight: tokens.touchTarget, justifyContent: 'center' },
  preferenceText: {
    color: tokens.colors.muted,
    fontSize: tokens.typography.label,
  },
});
