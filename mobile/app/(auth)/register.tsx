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

const schema = z
  .object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password_mismatch',
  });

type FormData = z.infer<typeof schema>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const getErrorMessage = (submitError: unknown): string => {
    if (!(submitError instanceof Error)) return t('auth.errors.registerError');
    if (submitError.message === 'Email already exists') return t('auth.errors.emailAlreadyRegistered');
    if (submitError.message === 'CAPTCHA_REQUIRED') return t('auth.errors.captchaRequired');
    if (submitError.message === 'CAPTCHA_INVALID') return t('auth.errors.captchaInvalid');
    if (submitError.message === 'CAPTCHA_NOT_CONFIGURED') return t('auth.errors.captchaUnavailable');
    return submitError.message;
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      if (!captchaToken) {
        setError(t('auth.errors.captchaRequired'));
        return;
      }
      const response = await register({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        password: values.password,
        captchaToken,
      });
      setMessage(response.message || t('auth.messages.pendingApproval'));
      setCaptchaToken(null);
    } catch (submitError) {
      setCaptchaToken(null);
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Screen>
      <View style={styles.header}>
        <H1>{t('auth.createAccount')}</H1>
        <Text style={styles.subtitle}>
          {t('metadata.description')}
        </Text>
      </View>

      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <Field label={t('auth.firstName', { defaultValue: 'Nombre' })} value={field.value} onChangeText={field.onChange} />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <Field label={t('auth.lastName', { defaultValue: 'Apellido' })} value={field.value} onChangeText={field.onChange} />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label={t('auth.email', { defaultValue: 'Email' })}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="none"
            keyboardType="email-address"
            testID="register.email"
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <Field
            label={t('auth.phone', { defaultValue: 'Teléfono' })}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="phone-pad"
            testID="register.phone"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Field
            label={t('auth.password', { defaultValue: 'Contraseña' })}
            value={field.value}
            onChangeText={field.onChange}
            secureTextEntry
            autoCapitalize="none"
            testID="register.password"
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field }) => (
          <Field
            label={t('auth.confirmPassword', { defaultValue: 'Repetir contraseña' })}
            value={field.value}
            onChangeText={field.onChange}
            secureTextEntry
            autoCapitalize="none"
            testID="register.confirmPassword"
          />
        )}
      />
      <View style={styles.captchaBlock}>
        <Text style={styles.captchaLabel}>
          {t('auth.captcha', { defaultValue: 'Verificación de seguridad' })}
        </Text>
        <TurnstileCaptcha onTokenChange={setCaptchaToken} testID="register.captcha" />
      </View>

      {Object.values(formState.errors).map((fieldError) => {
        if (!fieldError?.message) return null;
        const message =
          fieldError.message === 'password_mismatch' ? t('auth.errors.passwordMismatch') : fieldError.message;
        return (
          <Text key={`${fieldError.message}-${message}`} style={styles.error}>
            {message}
          </Text>
        );
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <AppButton
        title={t('auth.register')}
        onPress={onSubmit}
        loading={submitting}
        testID="register.submit"
      />

      <View style={styles.linkRow}>
        <Text style={styles.linkText}>{t('auth.alreadyHaveAccount')} </Text>
        <Link href="/(auth)/login" style={styles.linkAction}>
          {t('auth.login')}
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
    marginBottom: 8,
  },
  success: {
    color: '#166534',
    marginBottom: 8,
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
