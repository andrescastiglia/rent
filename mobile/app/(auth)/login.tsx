import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { TurnstileCaptcha } from '@/components/turnstile-captcha';
import { AppButton, Field, H1 } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginFailures, setLoginFailures] = useState(0);
  const [forceCaptcha, setForceCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const requiresCaptcha = forceCaptcha || loginFailures >= 1;

  const { control, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: 'admin@example.com',
      password: 'admin123',
    },
  });

  const getErrorMessage = (submitError: unknown): string => {
    if (!(submitError instanceof Error)) return t('auth.errors.loginError');
    if (submitError.message === 'user.blocked') return t('auth.errors.blocked');
    if (submitError.message === 'Invalid credentials' || submitError.message === 'Credenciales inválidas') {
      return t('auth.errors.invalidCredentials');
    }
    if (submitError.message === 'CAPTCHA_REQUIRED') return t('auth.errors.captchaRequired');
    if (submitError.message === 'CAPTCHA_INVALID') return t('auth.errors.captchaInvalid');
    if (submitError.message === 'CAPTCHA_NOT_CONFIGURED') return t('auth.errors.captchaUnavailable');
    return submitError.message;
  };

  const onSubmit = handleSubmit(async (data) => {
    if (requiresCaptcha && !captchaToken) {
      setError(t('auth.errors.captchaRequired'));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await login({
        email: data.email,
        password: data.password,
        captchaToken: requiresCaptcha ? captchaToken ?? undefined : undefined,
      });
      setLoginFailures(0);
      setForceCaptcha(false);
      setCaptchaToken(null);
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        (submitError.message === 'Invalid credentials' || submitError.message === 'Credenciales inválidas')
      ) {
        setLoginFailures((value) => value + 1);
      }
      if (submitError instanceof Error && submitError.message === 'CAPTCHA_REQUIRED') {
        setForceCaptcha(true);
      }
      setCaptchaToken(null);
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Screen>
      <View style={styles.header}>
        <H1>{t('auth.login')}</H1>
        <Text style={styles.subtitle}>
          {t('metadata.description')}
        </Text>
      </View>

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label={t('auth.email', { defaultValue: 'Email' })}
            value={field.value}
            onChangeText={field.onChange}
            placeholder="admin@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            testID="login.email"
          />
        )}
      />
      {formState.errors.email?.message ? <Text style={styles.error}>{formState.errors.email.message}</Text> : null}

      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Field
            label={t('auth.password', { defaultValue: 'Contraseña' })}
            value={field.value}
            onChangeText={field.onChange}
            placeholder="******"
            secureTextEntry
            autoCapitalize="none"
            testID="login.password"
          />
        )}
      />
      {formState.errors.password?.message ? <Text style={styles.error}>{formState.errors.password.message}</Text> : null}

      {requiresCaptcha ? (
        <View style={styles.captchaBlock}>
          <Text style={styles.captchaLabel}>
            {t('auth.captcha', { defaultValue: 'Verificación de seguridad' })}
          </Text>
          <TurnstileCaptcha onTokenChange={setCaptchaToken} testID="login.captcha" />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AppButton
        title={t('auth.login')}
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting}
        testID="login.submit"
      />

      <View style={styles.linkRow}>
        <Text style={styles.linkText}>{t('auth.noAccount')} </Text>
        <Link href="/(auth)/register" style={styles.linkAction}>
          {t('auth.register')}
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#4b5563',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 12,
  },
  captchaBlock: {
    marginBottom: 8,
  },
  captchaLabel: {
    color: '#374151',
    fontWeight: '600',
    marginBottom: 6,
  },
  linkRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  linkText: {
    color: '#374151',
  },
  linkAction: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
});
