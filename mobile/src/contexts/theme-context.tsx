import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { designTokens } from '@/config/design-tokens';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeColors = {
  [Key in keyof typeof designTokens.colors]: string;
} & {
  surfaceMuted: string;
  errorSurface: string;
  warningSurface: string;
  successSurface: string;
};
export const lightColors: ThemeColors = {
  ...designTokens.colors,
  surfaceMuted: '#f2f4f5',
  errorSurface: '#fef2f2',
  warningSurface: '#fff7ed',
  successSurface: '#ecfdf5',
};
export const darkColors: ThemeColors = {
  background: '#141c24',
  surface: '#1d2833',
  surfaceMuted: '#24323f',
  text: '#e9edf1',
  muted: '#b2bdc8',
  border: '#3b4b59',
  primary: '#92c5ef',
  onPrimary: '#152b3e',
  brand: '#ffdd55',
  success: '#8cd9a5',
  warning: '#f3cd79',
  error: '#ffaaa4',
  help: '#263d50',
  errorSurface: '#482728',
  warningSurface: '#433821',
  successSurface: '#203d30',
};
type ThemeState = {
  preference: ThemePreference;
  mode: 'light' | 'dark';
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => void;
};
const ThemeContext = createContext<ThemeState>({
  preference: 'system',
  mode: 'light',
  colors: lightColors,
  setPreference: () => undefined,
});
const isPreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const system = useColorScheme();
  const changed = useRef(false);
  const [preference, setPreference] = useState<ThemePreference>('system');
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync('rent.theme.preference')
      .then((saved) => {
        if (active && !changed.current && isPreference(saved))
          setPreference(saved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const systemMode = system === 'dark' ? 'dark' : 'light';
  const mode = preference === 'system' ? systemMode : preference;
  const state = useMemo<ThemeState>(
    () => ({
      preference,
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      setPreference: (next) => {
        changed.current = true;
        setPreference(next);
        void SecureStore.setItemAsync('rent.theme.preference', next).catch(
          () => undefined,
        );
      },
    }),
    [preference, mode],
  );
  return (
    <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>
  );
}
export function useTheme() {
  return useContext(ThemeContext);
}
