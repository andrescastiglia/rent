import { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import Ai from '../app/(app)/(tabs)/ai';
import Dashboard from '../app/(app)/(tabs)/dashboard';
import { aiApi } from '@/api/ai';
import { dashboardApi, type PersonActivityItem } from '@/api/dashboard';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  settle,
  textContent,
} from './render';

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
const status = (mode: 'NONE' | 'READONLY' | 'FULL' = 'READONLY') =>
  jest.spyOn(aiApi, 'getToolsStatus').mockResolvedValue({ mode, tools: [] });
function button(app: ReactTestRenderer, label: string) {
  return app.root.findAll(
    (node) =>
      (node.type as unknown) === 'Pressable' &&
      node.props.accessibilityLabel === label,
  )[0];
}
async function click(app: ReactTestRenderer, label: string) {
  await act(async () => {
    button(app, label).props.onPress();
  });
  await settle();
}
it('blocks chat when tools are disabled or unavailable', async () => {
  status('NONE');
  const respond = jest.spyOn(aiApi, 'respond');
  const app = await renderApp(<Ai />);
  expect(control(app, 'ai.prompt').props.editable).toBe(false);
  expect(control(app, 'ai.send').props.disabled).toBe(true);
  expect(respond).not.toHaveBeenCalled();
});
it('retains conversation identity, trims prompts and displays server-provided answers', async () => {
  status();
  const respond = jest.spyOn(aiApi, 'respond').mockResolvedValue({
    mode: 'READONLY',
    conversationId: 'conversation-1',
    model: 'model',
    outputText: 'Rent balance from source',
  });
  const app = await renderApp(<Ai />);
  await input(app, 'ai.prompt', '  Review the rent  ');
  await press(app, 'ai.send');
  expect(respond).toHaveBeenCalledWith('Review the rent', {
    conversationId: undefined,
  });
  expect(textContent(app)).toContain('Rent balance from source');
  expect(control(app, 'ai.prompt').props.value).toBe('');
  await input(app, 'ai.prompt', 'Next question');
  await press(app, 'ai.send');
  expect(respond).toHaveBeenLastCalledWith('Next question', {
    conversationId: 'conversation-1',
  });
});
it('reloads recorded conversation messages without duplicating them', async () => {
  status('FULL');
  jest.spyOn(aiApi, 'respond').mockResolvedValue({
    mode: 'FULL',
    conversationId: 'conversation-1',
    model: 'model',
    outputText: '',
  });
  const load = jest.spyOn(aiApi, 'getConversation').mockResolvedValue({
    conversationId: 'conversation-1',
    messages: [
      {
        id: 'recorded-1',
        role: 'assistant',
        content: 'Recorded answer',
        model: null,
        createdAt: '',
      },
    ],
  });
  const app = await renderApp(<Ai />);
  await input(app, 'ai.prompt', 'Question');
  await press(app, 'ai.send');
  expect(textContent(app)).toContain('common.noDataAvailable');
  await press(app, 'ai.reloadConversation');
  expect(load).toHaveBeenCalledWith('conversation-1');
  expect(textContent(app)).toContain('Recorded answer');
  expect(textContent(app)).not.toContain('Question');
});
it.each([new Error('Question forbidden'), 'offline'])(
  'shows a failed response and permits a deliberate new submission',
  async (error) => {
    status();
    const respond = jest.spyOn(aiApi, 'respond').mockRejectedValue(error);
    const app = await renderApp(<Ai />);
    await input(app, 'ai.prompt', 'Question');
    await press(app, 'ai.send');
    expect(textContent(app)).toContain(
      error instanceof Error ? error.message : 'messages.loadError',
    );
    expect(respond).toHaveBeenCalledTimes(1);
    expect(control(app, 'ai.prompt').props.editable).toBe(true);
  },
);
it('prevents parallel requests while a response is still pending', async () => {
  status();
  let resolve!: (value: Awaited<ReturnType<typeof aiApi.respond>>) => void;
  const respond = jest.spyOn(aiApi, 'respond').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const app = await renderApp(<Ai />);
  await input(app, 'ai.prompt', 'Question');
  await press(app, 'ai.send');
  expect(control(app, 'ai.prompt').props.editable).toBe(false);
  expect(control(app, 'ai.send').props.disabled).toBe(true);
  expect(respond).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({
      mode: 'READONLY',
      conversationId: 'c1',
      model: 'model',
      outputText: 'Done',
    });
  });
  await settle();
  expect(control(app, 'ai.prompt').props.editable).toBe(true);
});
it('shows conversation-reload errors without silently replacing the existing answer', async () => {
  status();
  jest.spyOn(aiApi, 'respond').mockResolvedValue({
    mode: 'READONLY',
    conversationId: 'c1',
    model: 'model',
    outputText: 'Existing answer',
  });
  jest
    .spyOn(aiApi, 'getConversation')
    .mockRejectedValue(new Error('Conversation unavailable'));
  const app = await renderApp(<Ai />);
  await input(app, 'ai.prompt', 'Question');
  await press(app, 'ai.send');
  await press(app, 'ai.reloadConversation');
  expect(textContent(app)).toContain('Existing answer');
  expect(textContent(app)).toContain('Conversation unavailable');
});
const proposal: PersonActivityItem = {
  id: 'proposal-item',
  sourceType: 'pending_action',
  personType: 'pending_action',
  personId: 'person-1',
  personName: 'Buyer',
  subject: 'Proposed payment',
  body: 'Review source and total',
  status: 'pending',
  dueAt: '2026-10-01',
  completedAt: null,
  propertyId: 'p1',
  propertyName: 'House',
  createdAt: '',
  updatedAt: '',
  actionKind: 'pending_action',
  actionId: 'proposal-1',
};
const communication: PersonActivityItem = {
  ...proposal,
  id: 'communication-item',
  sourceType: 'communication',
  personType: 'communication',
  subject: 'Incoming document',
  actionKind: 'communication',
  actionId: 'message-1',
  body: null,
  propertyName: null,
  dueAt: null,
};
async function dashboardQueries() {
  const overview = await dashboardApi.getOperationsOverview();
  jest.spyOn(dashboardApi, 'getOperationsOverview').mockResolvedValue(overview);
  return jest.spyOn(dashboardApi, 'getRecentActivity').mockResolvedValue({
    new: [proposal, communication],
    overdue: [proposal],
    today: [communication],
    total: 2,
  });
}
it('renders real overview categories and sends proposal approval to the authenticated review screen', async () => {
  await dashboardQueries();
  const approve = jest.spyOn(dashboardApi, 'approvePendingAction');
  const app = await renderApp(<Dashboard />);
  expect(textContent(app)).toContain('Review source and total');
  await click(app, 'channels.proposalReview');
  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://rent.maese.com.ar/es/dashboard#pending-actions',
  );
  expect(approve).not.toHaveBeenCalled();
  await click(app, 'Ver propiedades');
  expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/properties');
  await click(app, 'Ver alquileres');
  expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/leases');
});
it('requires confirmation before rejecting a proposal and refreshes the activity afterwards', async () => {
  const refresh = await dashboardQueries();
  const reject = jest
    .spyOn(dashboardApi, 'rejectPendingAction')
    .mockResolvedValue(undefined);
  const app = await renderApp(<Dashboard />);
  await click(app, 'dashboard.review.reject');
  expect(reject).not.toHaveBeenCalled();
  await act(async () => {
    jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)?.[2]
      ?.find((option) => option.style === 'destructive')
      ?.onPress?.();
  });
  await settle();
  expect(reject).toHaveBeenCalledWith('proposal-1');
  expect(refresh.mock.calls.length).toBeGreaterThan(1);
});
it('marks an incoming communication read and reports rejections without claiming completion', async () => {
  await dashboardQueries();
  const mark = jest
    .spyOn(dashboardApi, 'markCommunicationRead')
    .mockRejectedValueOnce(new Error('Read forbidden'))
    .mockResolvedValueOnce(undefined);
  const app = await renderApp(<Dashboard />);
  await click(app, 'dashboard.review.markRead');
  expect(Alert.alert).toHaveBeenCalledWith(
    'dashboard.review.readError',
    'Read forbidden',
  );
  await click(app, 'dashboard.review.markRead');
  expect(mark).toHaveBeenCalledWith('message-1');
});
it('does not show empty tasks as a successful result when an activity request failed', async () => {
  jest
    .spyOn(dashboardApi, 'getOperationsOverview')
    .mockRejectedValue(new Error('Overview unavailable'));
  jest
    .spyOn(dashboardApi, 'getRecentActivity')
    .mockRejectedValue(new Error('Activities unavailable'));
  const app = await renderApp(<Dashboard />);
  expect(textContent(app)).toContain('Overview unavailable');
  expect(textContent(app)).toContain('messages.loadError');
  expect(textContent(app)).not.toContain('dashboard.peopleActivity.noToday');
});
