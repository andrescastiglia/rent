import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';

type TurnstileCaptchaProps = {
  onTokenChange: (token: string | null) => void;
  testID?: string;
};

type BridgePayload =
  | { type: 'token'; token: string }
  | { type: 'expired' }
  | { type: 'error'; error?: string };

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const buildHtml = (siteKey: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #ffffff;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #widget {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }
    </style>
    <script>
      const post = (payload) => {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      };

      const renderCaptcha = () => {
        try {
          if (!window.turnstile) {
            setTimeout(renderCaptcha, 50);
            return;
          }

          window.turnstile.render('#widget', {
            sitekey: ${JSON.stringify(siteKey)},
            callback: function(token) {
              post({ type: 'token', token: token });
            },
            'expired-callback': function() {
              post({ type: 'expired' });
            },
            'error-callback': function() {
              post({ type: 'error', error: 'CAPTCHA_INVALID' });
            },
          });
        } catch (error) {
          post({ type: 'error', error: String(error) });
        }
      };
      window.__turnstileMobileOnLoad = renderCaptcha;
    </script>
    <script src="${TURNSTILE_SRC}" async defer onload="window.__turnstileMobileOnLoad && window.__turnstileMobileOnLoad()"></script>
  </head>
  <body>
    <div id="widget"></div>
  </body>
</html>`;

export function TurnstileCaptcha({ onTokenChange, testID = 'captcha.widget' }: TurnstileCaptchaProps) {
  const { t } = useTranslation();
  const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

  const html = useMemo(() => {
    if (!siteKey) return '';
    return buildHtml(siteKey);
  }, [siteKey]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as BridgePayload;
      if (payload.type === 'token') {
        onTokenChange(payload.token);
        return;
      }
      if (payload.type === 'expired' || payload.type === 'error') {
        onTokenChange(null);
      }
    } catch {
      onTokenChange(null);
    }
  };

  if (!siteKey) {
    return (
      <View style={styles.warningBox} testID={`${testID}.missingKey`}>
        <Text style={styles.warningText}>
          {t('auth.errors.captchaUnavailable', {
            defaultValue: 'El servicio CAPTCHA no está disponible en este momento.',
          })}
        </Text>
        <Text style={styles.hintText}>{t('auth.captchaConfigHint')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      <WebView
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  webView: {
    height: 76,
    backgroundColor: '#ffffff',
  },
  warningBox: {
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    padding: 10,
    marginBottom: 12,
  },
  warningText: {
    color: '#92400e',
    fontWeight: '600',
  },
  hintText: {
    color: '#78350f',
    marginTop: 4,
    fontSize: 12,
  },
});
