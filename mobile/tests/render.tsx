import React from 'react';
import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestInstance,
} from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mounted: ReactTestRenderer[] = [];
export async function renderApp(
  content: React.ReactNode,
): Promise<ReactTestRenderer> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>,
    );
  });
  mounted.push(renderer);
  await settle();
  return renderer;
}
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
export function control(
  renderer: ReactTestRenderer,
  id: string,
): ReactTestInstance {
  const matches = renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
  if (matches.length !== 1)
    throw new Error(`Expected one control ${id}, found ${matches.length}`);
  return matches[0];
}
export async function input(
  renderer: ReactTestRenderer,
  id: string,
  value: string,
): Promise<void> {
  await act(async () => {
    control(renderer, id).props.onChangeText(value);
  });
}
export async function press(
  renderer: ReactTestRenderer,
  id: string,
): Promise<void> {
  const node = control(renderer, id);
  if (node.props.disabled)
    throw new Error(`Cannot press disabled control ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
  await settle();
}
export function textContent(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON(), (key, value: unknown) =>
    key === 'props' && value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value).filter(
            ([, item]) =>
              item === null ||
              ['string', 'number', 'boolean'].includes(typeof item),
          ),
        )
      : value,
  );
}
export async function cleanup(): Promise<void> {
  await act(async () => {
    for (const renderer of mounted.splice(0)) renderer.unmount();
  });
}
