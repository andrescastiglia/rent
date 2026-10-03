import { getCurrentOrigin } from '@/utils/location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Pressable,
  View as NativeView,
} from 'react-native';
import * as Location from 'expo-location';
import { View, Text } from './themed-native';
import { AppButton, ChoiceGroup } from './ui';
import { useAuth } from '@/contexts/auth-context';
import { contactApi } from '@/api/contact-data';
import {
  mapsUrl,
  type Eta,
  type GeoDestination,
  type LocationRef,
  type TravelMode,
} from '@/api/contact-types';
export function GeoCard({
  location,
  entryId,
  autoEstimate = false,
}: {
  location?: LocationRef;
  entryId?: string;
  autoEstimate?: boolean;
}) {
  const { user } = useAuth();
  const host = useRef<NativeView>(null);
  const generation = useRef(0);
  const [visible, setVisible] = useState(false),
    [point, setPoint] = useState<GeoDestination | null>(null),
    [image, setImage] = useState(''),
    [imageError, setImageError] = useState(''),
    [eta, setEta] = useState<Eta | null>(null),
    [error, setError] = useState(''),
    [mode, setMode] = useState<TravelMode>('driving'),
    [busy, setBusy] = useState(false);
  const type = location?.type,
    id = location?.id;
  useEffect(() => {
    if (visible) return;
    const timer = setInterval(
      () =>
        host.current?.measureInWindow((_x, y, _w, h) => {
          if (y + h >= 0 && y < Dimensions.get('window').height)
            setVisible(true);
        }),
      500,
    );
    return () => clearInterval(timer);
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    ++generation.current;
    setBusy(false);
    let active = true;
    const abort = new AbortController();
    setPoint(null);
    setImage('');
    setImageError('');
    setEta(null);
    setError('');
    (async () => {
      try {
        if (!(await contactApi.config()).maps) return;
        const destination = entryId
          ? await contactApi.entry(entryId)
          : type && id
            ? await contactApi.destination({ type, id })
            : null;
        if (!active || !destination) return;
        setPoint(destination);
        try {
          const uri = await contactApi.image(destination, abort.signal);
          if (active) setImage(uri);
        } catch {
          if (active) setImageError('Imagen temporalmente no disponible');
        }
      } catch {
        /* Optional map. */
      }
    })();
    return () => {
      active = false;
      ++generation.current;
      abort.abort();
    };
  }, [visible, type, id, entryId, user?.id, user?.companyId]);
  const estimate = useCallback(
    async (selected: TravelMode) => {
      if (!point) return;
      const version = generation.current;
      setBusy(true);
      setEta(null);
      setError('');
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') throw new Error();
        const origin = await getCurrentOrigin();
        const result = await contactApi.eta(point, origin, selected);
        if (generation.current === version) setEta(result);
      } catch {
        if (generation.current === version)
          setError('No hay una estimación de llegada. Podés usar Ir ahí.');
      } finally {
        if (generation.current === version) setBusy(false);
      }
    },
    [point],
  );
  const estimated = useRef('');
  useEffect(() => {
    if (
      autoEstimate &&
      point &&
      estimated.current !== `${point.type}:${point.id}`
    ) {
      estimated.current = `${point.type}:${point.id}`;
      void estimate('driving');
    }
  }, [point, autoEstimate, estimate]);
  async function navigate() {
    if (!point) return;
    try {
      await Linking.openURL(mapsUrl(point, mode, true));
    } catch {
      try {
        await Linking.openURL(mapsUrl(point, mode));
      } catch {
        setError('No se pudo abrir la navegación');
      }
    }
  }
  return (
    <NativeView ref={host} collapsable={false}>
      {point && (
        <View style={{ gap: 10, padding: 12 }}>
          <Text>{point.address}</Text>
          {!point.precise && (
            <Text>Ubicación aproximada; confirmá el domicilio.</Text>
          )}
          {image ? (
            <Pressable
              disabled={busy}
              onPress={() => void estimate(mode)}
              accessibilityRole="button"
              accessibilityLabel="Calcular tiempo de llegada"
            >
              <Image
                source={{ uri: image }}
                style={{ width: '100%', height: 180 }}
                resizeMode="cover"
              />
            </Pressable>
          ) : (
            <Text>{imageError || 'Cargando imagen…'}</Text>
          )}
          <Text
            onPress={() =>
              void Linking.openURL(
                'https://www.esri.com/en-us/legal/terms/data-attributions',
              )
            }
          >
            Esri y proveedores de imágenes
          </Text>
          <ChoiceGroup
            label="Traslado"
            value={mode}
            options={[
              { value: 'driving', label: 'Auto' },
              { value: 'walking', label: 'Caminata' },
              { value: 'cycling', label: 'Bicicleta' },
            ]}
            onChange={(value) => {
              if (busy) return;
              setMode(value as TravelMode);
              void estimate(value as TravelMode);
            }}
          />
          <AppButton
            title={busy ? 'Calculando…' : 'Calcular llegada'}
            disabled={busy}
            onPress={() => void estimate(mode)}
          />
          <AppButton title="Ir ahí" onPress={() => void navigate()} />
          {eta && (
            <Text>
              {Math.max(1, Math.round(eta.durationSeconds / 60))} min · Llegada{' '}
              {new Date(eta.arrivesAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · Sin tráfico en tiempo real
            </Text>
          )}
          {error && <Text accessibilityRole="alert">{error}</Text>}
          {eta && <Text>{eta.attribution}</Text>}
        </View>
      )}
    </NativeView>
  );
}
