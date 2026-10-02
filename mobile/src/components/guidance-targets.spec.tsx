import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Screen } from './screen';
import { AppButton, ChoiceGroup, Field } from './ui';
import { useGuidanceBlocker } from './guidance';
import { useConfirmationDialog } from './use-confirmation-dialog';
import { selectGuidanceControl, type GuidanceControl } from '@/config/guidance';
let app: ReactTestRenderer;
const host = (id: string) =>
  app.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  )[0];
const text = () =>
  app.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((value) => typeof value === 'string');
const actOn = async (id: string, value?: string) =>
  act(async () => {
    const node = host(id);
    if (value === undefined) node.props.onPress();
    else node.props.onChangeText(value);
  });
const advance = async (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
function Fields({
  blocked = false,
  busy = false,
}: {
  blocked?: boolean;
  busy?: boolean;
}) {
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  useGuidanceBlocker('validation', blocked);
  return (
    <>
      <Field
        label="Propiedad"
        value={name}
        onChangeText={setName}
        testID="propertyCreate.name"
      />
      <Field
        label="Propietario"
        value=""
        editable={false}
        onChangeText={() => undefined}
        testID="propertyCreate.ownerId"
      />
      <Field
        label="Calle"
        value={street}
        onChangeText={setStreet}
        testID="propertyCreate.street"
      />
      <AppButton
        title="Guardar propiedad"
        onPress={() => undefined}
        disabled={busy}
        testID="propertyCreate.submit"
      />
    </>
  );
}
function Dialog() {
  const dialog = useConfirmationDialog();
  return (
    <Screen guidanceBlocked={dialog.open}>
      <AppButton
        title="Revisar contrato"
        onPress={() =>
          dialog.confirm('Confirmar', 'Revisar antes de continuar', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Aceptar', onPress: () => undefined },
          ])
        }
        testID="lease.review"
      />
    </Screen>
  );
}
async function mount(element: React.ReactElement) {
  await act(async () => {
    app = create(element);
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(usePathname).mockReturnValue('/properties/new');
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});
afterEach(async () => {
  if (app) await act(async () => app.unmount());
  jest.useRealTimers();
});
it('points to a real enabled pending field, then advances to the next field without altering entered data', async () => {
  await mount(
    <Screen>
      <Fields />
    </Screen>,
  );
  await advance(8000);
  expect(text()).toContain('guidance.properties.initial · Propiedad');
  expect(StyleSheet.flatten(host('propertyCreate.name').props.style)).toEqual(
    expect.objectContaining({ borderColor: '#245b83', borderWidth: 2 }),
  );
  expect(host('propertyCreate.ownerId').props.editable).toBe(false);
  await actOn('propertyCreate.name', 'Departamento Central');
  await advance(12000);
  expect(text()).toContain('guidance.properties.next · Calle');
  expect(host('propertyCreate.name').props.value).toBe('Departamento Central');
  await actOn('propertyCreate.street', 'Av. Principal');
  await advance(12000);
  expect(text()).toContain('guidance.properties.next · Guardar propiedad');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
    'guidance.properties.next · Guardar propiedad',
  );
});
it('never recommends a disabled submit action, and resumes only after validation blockers clear', async () => {
  await mount(
    <Screen>
      <Fields blocked busy />
    </Screen>,
  );
  await advance(30000);
  expect(
    text().some((value) =>
      String(value).startsWith('guidance.properties.initial'),
    ),
  ).toBe(false);
  await act(async () =>
    app.update(
      <Screen>
        <Fields />
      </Screen>,
    ),
  );
  await advance(8000);
  expect(text()).toContain('guidance.properties.initial · Propiedad');
  await actOn('propertyCreate.name', 'Departamento');
  await actOn('propertyCreate.street', 'Calle');
  await act(async () =>
    app.update(
      <Screen>
        <Fields busy />
      </Screen>,
    ),
  );
  await advance(12000);
  expect(
    text().some((value) => String(value).includes('· Guardar propiedad')),
  ).toBe(false);
});
it('pauses while a native confirmation is open and restarts after explicit cancellation', async () => {
  jest.mocked(usePathname).mockReturnValue('/leases/selected');
  await mount(<Dialog />);
  await advance(8000);
  expect(text()).toContain('guidance.leases.initial · Revisar contrato');
  await actOn('lease.review');
  await advance(30000);
  expect(
    text().some((value) => String(value).includes('guidance.leases.next')),
  ).toBe(false);
  await act(async () =>
    jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)?.[2]
      ?.find((button) => button.style === 'cancel')
      ?.onPress?.(),
  );
  await advance(12000);
  expect(text()).toContain('guidance.leases.next · Revisar contrato');
});
it('resolves a dismissed native confirmation and delegates the original dismissal callback', async () => {
  jest.mocked(usePathname).mockReturnValue('/leases/selected');
  await mount(<Dialog />);
  await actOn('lease.review');
  await act(async () =>
    jest.mocked(Alert.alert).mock.calls.at(-1)?.[3]?.onDismiss?.(),
  );
  await advance(12000);
  expect(text()).toContain('guidance.leases.next · Revisar contrato');
});
it('filters absent, disabled and destructive controls instead of guessing actions from permissions alone', () => {
  const field: GuidanceControl = {
    id: 'lease.tenantId',
    label: 'Inquilino',
    kind: 'field',
    enabled: false,
    complete: false,
  };
  const save: GuidanceControl = {
    id: 'lease.submit',
    label: 'Guardar',
    kind: 'action',
    enabled: true,
    complete: true,
  };
  expect(selectGuidanceControl('/leases/new', [field, save])?.id).toBe(
    'lease.submit',
  );
  expect(selectGuidanceControl('/leases/new', [field])).toBeNull();
  expect(
    selectGuidanceControl('/leases/selected', [
      { ...save, id: 'lease.delete' },
    ]),
  ).toBeNull();
  expect(selectGuidanceControl('/unknown', [])).toBeNull();
  expect(
    selectGuidanceControl('/properties', [{ ...save, id: 'property.new' }])?.id,
  ).toBe('property.new');
});
it.each([
  ['/tenants/tenant/activities/new', 'tenantActivityCreate.subject'],
  ['/interested/person/activities/new', 'interestedActivityCreate.subject'],
  ['/properties/property/visits/new', 'visitCreate.interestedName'],
  ['/properties/property/maintenance/new', 'maintenanceCreate.title'],
  ['/tenants/tenant/payments/new', 'tenantPaymentCreate.amount'],
])('uses task-specific pending fields for %s', (path, id) => {
  const field: GuidanceControl = {
    id,
    label: 'Pendiente',
    kind: 'field',
    enabled: true,
    complete: false,
  };
  const submit: GuidanceControl = {
    id: 'task.submit',
    label: 'Guardar',
    kind: 'action',
    enabled: true,
    complete: true,
  };
  expect(selectGuidanceControl(path, [field, submit])?.id).toBe(id);
  expect(
    selectGuidanceControl(path, [{ ...field, complete: true }, submit])?.id,
  ).toBe(submit.id);
});
it('points to a selectable payment account and advances after explicit selection', async () => {
  jest.mocked(usePathname).mockReturnValue('/payments/new');
  function PaymentFields() {
    const [account, setAccount] = useState('');
    return (
      <>
        <ChoiceGroup
          label="Cuenta del inquilino"
          value={account}
          onChange={setAccount}
          options={[{ value: 'account', label: 'Inquilino autorizado' }]}
          testID="paymentCreate.tenantAccountId"
        />
        <AppButton
          title="Registrar cobro"
          onPress={() => undefined}
          testID="paymentCreate.submit"
        />
      </>
    );
  }
  await mount(
    <Screen>
      <PaymentFields />
    </Screen>,
  );
  await advance(8000);
  expect(text()).toContain('guidance.payments.initial · Cuenta del inquilino');
  await actOn('paymentCreate.tenantAccountId.account');
  await advance(12000);
  expect(text()).toContain('guidance.payments.next · Registrar cobro');
  expect(
    host('paymentCreate.tenantAccountId.account').props.accessibilityState
      .checked,
  ).toBe(true);
});
