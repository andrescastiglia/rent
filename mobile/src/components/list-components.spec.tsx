import { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ModuleListScreen } from './module-list';
import { Pagination } from './pagination';
import { TurnstileCaptcha } from './turnstile-captcha';
import { cleanup, renderApp, settle, textContent } from '../../tests/render';

afterEach(cleanup);
it('virtualizes records with stable identifiers and shows the title and context', async () => {
  const app = await renderApp(
    <ModuleListScreen
      title="Properties"
      subtitle="Available"
      queryKey={['list']}
      queryFn={async () => [
        { id: 'p1', name: 'House' },
        { id: 'p2', name: 'Office' },
      ]}
      renderItem={(item) => <Text>{item.name}</Text>}
    />,
  );
  const list = app.root.findByType('FlatList' as never);
  expect(list.props.keyExtractor({ id: 3 })).toBe('3');
  expect(list.props.keyExtractor('fallback')).toBe('"fallback"');
  expect(textContent(app)).toContain('House');
  expect(textContent(app)).toContain('Available');
});
it('distinguishes initial loading, empty data and recoverable query failure', async () => {
  let resolve!: (value: string[]) => void;
  const load = jest.fn(
    () =>
      new Promise<string[]>((done) => {
        resolve = done;
      }),
  );
  const app = await renderApp(
    <ModuleListScreen
      title="Tasks"
      queryKey={['tasks']}
      queryFn={load}
      renderItem={(item) => <Text>{item}</Text>}
    />,
  );
  expect(app.root.findAllByType('ActivityIndicator' as never)).toHaveLength(1);
  await act(async () => {
    resolve([]);
  });
  await settle();
  expect(textContent(app)).toContain('common.noDataAvailable');
  const query = jest
    .fn<Promise<string[]>, []>()
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce(['Recovered']);
  const failed = await renderApp(
    <ModuleListScreen
      title="Tasks"
      queryKey={['retry']}
      queryFn={query}
      renderItem={(item) => <Text>{item}</Text>}
    />,
  );
  expect(textContent(failed)).toContain('Network unavailable');
  const retry = failed.root.findAll(
    (node) =>
      (node.type as unknown) === 'Pressable' &&
      node.props.accessibilityLabel === 'common.retry',
  )[0];
  await act(async () => {
    retry.props.onPress();
  });
  await settle();
  expect(textContent(failed)).toContain('Recovered');
  expect(query).toHaveBeenCalledTimes(2);
});
it('enforces page bounds and disables page changes while loading', async () => {
  const change = jest.fn();
  const app = await renderApp(
    <Pagination result={{ page: 1, limit: 20, total: 41 }} onPage={change} />,
  );
  const buttons = () =>
    app.root.findAll((node) => (node.type as unknown) === 'Pressable');
  expect(buttons()[0].props.accessibilityState.disabled).toBe(true);
  await act(async () => {
    buttons()[1].props.onPress();
  });
  expect(change).toHaveBeenCalledWith(2);
  await act(async () => {
    app.update(
      <Pagination result={{ page: 3, limit: 20, total: 41 }} onPage={change} />,
    );
  });
  expect(buttons()[1].props.accessibilityState.disabled).toBe(true);
  await act(async () => {
    buttons()[0].props.onPress();
  });
  expect(change).toHaveBeenCalledWith(2);
  await act(async () => {
    app.update(
      <Pagination
        loading
        result={{ page: 2, limit: 20, total: 41 }}
        onPage={change}
      />,
    );
  });
  expect(
    buttons().every((node) => node.props.accessibilityState.disabled),
  ).toBe(true);
  await act(async () => {
    app.update(
      <Pagination result={{ page: 1, limit: 20, total: 20 }} onPage={change} />,
    );
  });
  expect(app.toJSON()).toBeNull();
});
it('shows an explicit unavailable CAPTCHA state when configuration is missing', async () => {
  delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  const token = jest.fn();
  const app = await renderApp(<TurnstileCaptcha onTokenChange={token} />);
  expect(textContent(app)).toContain('captcha.widget.missingKey');
  expect(token).not.toHaveBeenCalled();
});
it('handles CAPTCHA token, expiration, rejection and malformed bridge messages', async () => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = ' configured-key ';
  try {
    const token = jest.fn();
    const app = await renderApp(<TurnstileCaptcha onTokenChange={token} />);
    const web = app.root.findByType('WebView' as never);
    expect(web.props.source.html).toContain('sitekey: "configured-key"');
    for (const data of [
      '{"type":"token","token":"verified"}',
      '{"type":"expired"}',
      '{"type":"error"}',
      '{broken',
      '{"type":"unknown"}',
    ]) {
      await act(async () => {
        web.props.onMessage({ nativeEvent: { data } });
      });
    }
    expect(token.mock.calls).toEqual([['verified'], [null], [null], [null]]);
  } finally {
    delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  }
});
