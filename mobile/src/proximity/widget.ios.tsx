import { createWidget } from 'expo-widgets';
import { Link, Text, VStack } from '@expo/ui/swift-ui';
import { font, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import type { WidgetSnapshot } from '../../../shared/proximity';
import { expireSnapshot } from '../../../shared/proximity';
const widget = createWidget<WidgetSnapshot>(
  'RentProximity',
  (props, environment) => {
    'widget';
    const count =
      environment.widgetFamily === 'systemSmall'
        ? 0
        : environment.widgetFamily === 'systemLarge'
          ? 5
          : 2;
    const expired =
      props.stale !== false ||
      !props.expiresAt ||
      environment.date.getTime() > props.expiresAt;
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ all: 12 }), widgetURL('rent://proximity')]}
      >
        <Text modifiers={[font({ size: 16, weight: 'bold' })]}>
          {expired ? 'Asistencia a visitas' : props.title}
        </Text>
        <Text>
          {expired
            ? props.enabled
              ? 'Ubicación desactualizada'
              : 'Asistencia desactivada'
            : props.address}
        </Text>
        {!expired &&
          props.lines.slice(0, count || 1).map((line, index) => (
            <Text key={index} modifiers={[font({ size: 12 })]}>
              {line}
            </Text>
          ))}
        {!expired &&
          props.communications.slice(0, count).map((c) => (
            <Text key={c.id} modifiers={[font({ size: 11 })]}>
              {c.createdAt.slice(0, 10)} · {c.channel} ·{' '}
              {c.summary.slice(0, 100)}
            </Text>
          ))}
        {!expired && props.contact && (
          <Link
            label="Avisar que llegué"
            destination={`rent://proximity?contactType=${props.contact.type}&contactId=${props.contact.id}&arrival=1`}
          />
        )}
        <Text modifiers={[font({ size: 10 })]}>
          {props.updatedAt
            ? `Actualizado ${new Date(props.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Abrí Rent para activar'}
        </Text>
      </VStack>
    );
  },
);
export const nativeWidgetAvailable = true;
export function updateWidget(snapshot: WidgetSnapshot): void {
  widget.updateSnapshot(snapshot);
  if (!snapshot.stale)
    widget.updateTimeline([
      { date: new Date(), props: snapshot },
      { date: new Date(snapshot.expiresAt), props: expireSnapshot(snapshot) },
    ]);
  else widget.updateTimeline([{ date: new Date(), props: snapshot }]);
}
