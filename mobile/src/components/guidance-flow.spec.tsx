import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, Keyboard, Platform, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { usePathname } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { GuidanceMessage, useScreenGuidance } from './guidance';
import { Screen } from './screen';
import { AppButton, Field } from './ui';

let app: ReactTestRenderer;
let guidance: ReturnType<typeof useScreenGuidance>;
function Probe({ ready = true, blocked = false }) {
  guidance = useScreenGuidance({ ready, blocked });
  return <GuidanceMessage guidance={guidance} />;
}
async function mount(content = <Probe />) {
  await act(async () => {
    app = create(content);
  });
}
async function advance(milliseconds: number) {
  await act(async () => {
    jest.advanceTimersByTime(milliseconds);
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(usePathname).mockReturnValue('/properties');
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
});
afterEach(async () => {
  if (app)
    await act(async () => {
      app.unmount();
    });
  jest.useRealTimers();
});

it('offers initial help after eight seconds, announces it and prevents repeats during the visit', async () => {
  await mount();
  await advance(7999);
  expect(guidance.visible).toBeNull();
  await advance(1);
  expect(guidance.visible?.stage).toBe('initial');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    'guidance.properties.initial',
  );
  await act(async () => {
    guidance.dismiss();
  });
  await advance(20000);
  expect(guidance.visible).toBeNull();
});
it('resets the next-step timer on each interaction and does not repeat it after dismissal', async () => {
  await mount();
  await act(async () => {
    guidance.interact();
  });
  await advance(11000);
  await act(async () => {
    guidance.interact();
  });
  await advance(11999);
  expect(guidance.visible).toBeNull();
  await advance(1);
  expect(guidance.visible?.stage).toBe('next');
  await act(async () => {
    guidance.dismiss();
    guidance.interact();
  });
  await advance(12000);
  expect(guidance.visible).toBeNull();
});
it('waits for data and suppresses help while a blocking validation or operation error is present', async () => {
  await mount(<Probe ready={false} />);
  await advance(20000);
  expect(guidance.visible).toBeNull();
  await act(async () => {
    app.update(<Probe ready blocked />);
  });
  await advance(20000);
  expect(guidance.visible).toBeNull();
  await act(async () => {
    app.update(<Probe ready />);
  });
  await advance(8000);
  expect(guidance.visible?.stage).toBe('initial');
});
it('persists pause preference, supports resuming, and tolerates secure-store failures', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('true');
  await mount();
  await advance(20000);
  expect(guidance.paused).toBe(true);
  expect(guidance.visible).toBeNull();
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValue(new Error('device locked'));
  await act(async () => {
    guidance.togglePause();
  });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'rent.help.paused',
    'false',
  );
  await advance(8000);
  expect(guidance.visible?.stage).toBe('initial');
  await act(async () => {
    guidance.togglePause();
  });
  expect(guidance.visible).toBeNull();
});
it('uses the default preference after an unreadable store and resets per-visit state on navigation', async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockRejectedValue(new Error('store unavailable'));
  await mount();
  await advance(8000);
  expect(guidance.visible?.module).toBe('properties');
  jest.mocked(usePathname).mockReturnValue('/tenants/new');
  await act(async () => {
    app.update(<Probe />);
  });
  expect(guidance.visible).toBeNull();
  await advance(8000);
  expect(guidance.visible?.module).toBe('tenants');
});
it('hides help while the keyboard is open and restarts after it closes', async () => {
  await mount();
  await advance(8000);
  const listener = (event: string) =>
    jest
      .mocked(Keyboard.addListener)
      .mock.calls.find(([name]) => name === event)?.[1];
  await act(async () => {
    listener('keyboardDidShow')?.({} as never);
  });
  await advance(20000);
  expect(guidance.visible).toBeNull();
  await act(async () => {
    listener('keyboardDidHide')?.({} as never);
    guidance.interact();
  });
  await advance(12000);
  expect(guidance.visible?.stage).toBe('next');
});
it('connects field changes and scrolling to help timing without overlaying form controls', async () => {
  const onChangeText = jest.fn();
  await mount(
    <Screen scrollViewTestID="content">
      <Field
        label="Address"
        value=""
        onChangeText={onChangeText}
        testID="address"
      />
    </Screen>,
  );
  const field = app.root.findAll(
    (node) =>
      (node.type as unknown) === 'TextInput' && node.props.testID === 'address',
  )[0];
  await act(async () => {
    field.props.onChangeText('Main 123');
  });
  expect(onChangeText).toHaveBeenCalledWith('Main 123');
  await advance(11999);
  expect(
    app.root
      .findAllByType(Text)
      .some(
        (node) =>
          typeof node.props.children === 'string' &&
          node.props.children.startsWith('guidance.properties.next'),
      ),
  ).toBe(false);
  await advance(1);
  expect(
    app.root
      .findAllByType(Text)
      .some(
        (node) =>
          typeof node.props.children === 'string' &&
          node.props.children.startsWith('guidance.properties.next'),
      ),
  ).toBe(true);
  const scroll = app.root.findByType('ScrollView' as never);
  await act(async () => {
    scroll.props.onScrollEndDrag();
  });
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(app.root.findByType('SafeAreaView' as never).props.edges).toEqual([
    'left',
    'right',
    'bottom',
  ]);
});
it.each(['ios', 'android'] as const)(
  'accounts for the native header during %s keyboard avoidance',
  async (platform) => {
    const original = Platform.OS;
    Platform.OS = platform;
    try {
      await mount(
        <HeaderHeightContext.Provider value={104}>
          <Screen padded={false} scrollable={false}>
            <Text>Content</Text>
          </Screen>
        </HeaderHeightContext.Provider>,
      );
      expect(app.root.findAllByType('ScrollView' as never)).toHaveLength(0);
      expect(
        app.root.findByType('KeyboardAvoidingView' as never).props.behavior,
      ).toBe(platform === 'ios' ? 'padding' : 'height');
      expect(
        app.root.findByType('KeyboardAvoidingView' as never).props
          .keyboardVerticalOffset,
      ).toBe(104);
    } finally {
      Platform.OS = original;
    }
  },
);

it('keeps help in place until a touch or drag finishes and lets the action run', async () => {
  const onPress = jest.fn();
  await mount(
    <Screen scrollViewTestID="content">
      <AppButton title="Create property" onPress={onPress} testID="create" />
    </Screen>,
  );
  await advance(8000);
  const messageVisible = () =>
    app.root
      .findAllByType(Text)
      .some((node) => node.props.children === 'guidance.title');
  expect(messageVisible()).toBe(true);
  const touchSurface = app.root
    .findAllByType('View' as never)
    .find((node) => node.props.onTouchEnd);
  expect(touchSurface).toBeDefined();
  await act(async () => {
    touchSurface?.props.onTouchStart?.();
  });
  expect(messageVisible()).toBe(true);
  const button = app.root
    .findAllByType('Pressable' as never)
    .find((node) => node.props.testID === 'create');
  await act(async () => {
    button?.props.onPress();
    touchSurface?.props.onTouchEnd();
  });
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(messageVisible()).toBe(false);
  await advance(12000);
  expect(messageVisible()).toBe(true);
  const scroll = app.root.findByType('ScrollView' as never);
  await act(async () => {
    scroll.props.onScrollBeginDrag?.();
  });
  expect(messageVisible()).toBe(true);
  await act(async () => {
    scroll.props.onScrollEndDrag();
  });
  expect(messageVisible()).toBe(false);
});
it('clears asynchronous initialization safely after unmount', async () => {
  let resolve!: (value: string | null) => void;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  await act(async () => {
    app.unmount();
    resolve(null);
  });
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});
