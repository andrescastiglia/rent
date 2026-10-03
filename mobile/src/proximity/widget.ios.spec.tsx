import type { WidgetSnapshot } from '../../../shared/proximity';
import { blankSnapshot } from '../../../shared/proximity';
import { updateWidget } from './widget.ios';
import { createWidget } from 'expo-widgets';
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => ({
    updateSnapshot: jest.fn(),
    updateTimeline: jest.fn(),
  })),
}));
const mockRender = (createWidget as jest.Mock).mock.calls[0][1] as (
  props: WidgetSnapshot,
  environment: { widgetFamily: string; date: Date },
) => React.ReactNode;
const { updateSnapshot: mockSnapshot, updateTimeline: mockTimeline } = (
  createWidget as jest.Mock
).mock.results[0].value;
jest.mock('@expo/ui/swift-ui', () => ({
  Link: 'WidgetLink',
  Text: 'WidgetText',
  VStack: 'WidgetStack',
}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  font: jest.fn(),
  padding: jest.fn(),
  widgetURL: jest.fn(),
}));
const snapshot: WidgetSnapshot = {
  ...blankSnapshot(true),
  stale: false,
  title: 'Ana',
  address: 'Mitre 100',
  expiresAt: Date.now() + 60000,
  updatedAt: Date.now(),
  lines: ['Line one', 'Line two'],
  communications: [
    {
      id: 'comm',
      channel: 'call',
      direction: 'outbound',
      createdAt: '2026-10-03',
      summary: 'Visit agreed',
    },
  ],
  contact: {
    type: 'owner',
    id: 'ana',
    name: 'Ana',
    relationship: 'Propietaria',
  },
};
it.each(['systemSmall', 'systemMedium', 'systemLarge'])(
  'renders only current contact data in %s widgets',
  (family) => {
    const result = JSON.stringify(
      mockRender(snapshot, { widgetFamily: family, date: new Date() }),
    );
    expect(result).toContain('Ana');
    expect(result).toContain('arrival=1');
    if (family === 'systemLarge') expect(result).toContain('Visit agreed');
  },
);
it('removes personal data after expiry and schedules a sanitized snapshot', () => {
  const result = JSON.stringify(
    mockRender(snapshot, {
      widgetFamily: 'systemLarge',
      date: new Date(snapshot.expiresAt + 1),
    }),
  );
  expect(result).not.toContain('Mitre 100');
  expect(result).not.toContain('Visit agreed');
  expect(result).toContain('Ubicación desactualizada');
  updateWidget(snapshot);
  expect(mockSnapshot).toHaveBeenCalledWith(snapshot);
  expect(mockTimeline).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        props: expect.objectContaining({
          stale: true,
          contact: null,
          address: '',
        }),
      }),
    ]),
  );
  updateWidget(blankSnapshot());
  expect(mockTimeline).toHaveBeenLastCalledWith([
    expect.objectContaining({ props: blankSnapshot() }),
  ]);
});
