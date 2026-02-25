import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import pt from '@/messages/pt.json';

const normalizeLocale = (value: string | undefined): 'es' | 'en' | 'pt' => {
  if (value?.startsWith('en')) return 'en';
  if (value?.startsWith('pt')) return 'pt';
  return 'es';
};

const initialLocale = normalizeLocale(Localization.getLocales()[0]?.languageTag);

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    lng: initialLocale,
    fallbackLng: 'es',
    resources: {
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
    },
    interpolation: {
      escapeValue: false,
    },
  });
}

export { i18n };
