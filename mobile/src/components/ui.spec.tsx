import { act } from 'react-test-renderer';
import { Platform } from 'react-native';
import { useSegments } from 'expo-router';
import {
  AppButton,
  Body,
  ChoiceGroup,
  DateField,
  Field,
  H1,
  MultiChoiceGroup,
} from './ui';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  textContent,
} from '../../tests/render';
afterEach(cleanup);
it('labels inputs and communicates disabled and busy button states', async () => {
  const submit = jest.fn();
  const change = jest.fn();
  const app = await renderApp(
    <>
      <AppButton title="Save" testID="save" onPress={submit} />
      <AppButton title="Busy" testID="busy" loading onPress={submit} />
      <AppButton
        title="Secondary"
        variant="secondary"
        disabled
        testID="secondary"
        onPress={submit}
      />
      <Field label="Amount" testID="amount" value="10" onChangeText={change} />
      <Field
        label="Historical currency"
        value="ARS"
        editable={false}
        onChangeText={change}
      />
      <Body>Help text</Body>
    </>,
  );
  expect(control(app, 'amount').props.accessibilityLabel).toBe('Amount');
  expect(control(app, 'busy').props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  expect(control(app, 'secondary').props.disabled).toBe(true);
  await input(app, 'amount', '25');
  expect(change).toHaveBeenCalledWith('25');
  await press(app, 'save');
  expect(submit).toHaveBeenCalledTimes(1);
  expect(textContent(app)).toContain('Help text');
});
it('keeps locked roles selected and permits changes to other roles', async () => {
  const selected = jest.fn();
  const app = await renderApp(
    <MultiChoiceGroup
      label="Roles"
      testID="roles"
      values={['admin', 'owner']}
      lockedValues={['admin']}
      options={[
        { label: 'Admin', value: 'admin' },
        { label: 'Owner', value: 'owner' },
        { label: 'Buyer', value: 'buyer' },
      ]}
      onChange={selected}
    />,
  );
  expect(control(app, 'roles.admin').props.disabled).toBe(true);
  await press(app, 'roles.owner');
  expect(selected).toHaveBeenLastCalledWith(['admin']);
  await press(app, 'roles.buyer');
  expect(selected).toHaveBeenLastCalledWith(['admin', 'owner', 'buyer']);
});
it('announces the selected radio option', async () => {
  const change = jest.fn();
  const app = await renderApp(
    <ChoiceGroup
      label="Operation"
      testID="operation"
      value="rent"
      options={[
        { label: 'Rent', value: 'rent' },
        { label: 'Sale', value: 'sale' },
      ]}
      onChange={change}
    />,
  );
  expect(control(app, 'operation.rent').props.accessibilityState.checked).toBe(
    true,
  );
  await press(app, 'operation.sale');
  expect(change).toHaveBeenCalledWith('sale');
});
it.each(['2026-02-30', 'invalid', '2026-02-28'])(
  'handles date input %s and serializes selected date without UTC shifts',
  async (value) => {
    const change = jest.fn();
    const app = await renderApp(
      <DateField
        label="Due date"
        testID="due"
        value={value}
        onChange={change}
      />,
    );
    await press(app, 'due');
    const picker = control(app, 'due.picker');
    expect(Number.isNaN(picker.props.value.getTime())).toBe(false);
    await act(async () => {
      picker.props.onValueChange({ nativeEvent: {} }, new Date(2026, 9, 5));
    });
    expect(change).toHaveBeenCalledWith('2026-10-05');
    expect(control(app, 'due').props.accessibilityState.expanded).toBe(false);
  },
);
it('dismisses a date picker without changing the stored value', async () => {
  const change = jest.fn();
  const app = await renderApp(
    <DateField label="Due" testID="due" value="" onChange={change} />,
  );
  await press(app, 'due');
  await act(async () => {
    control(app, 'due.picker').props.onDismiss();
  });
  expect(change).not.toHaveBeenCalled();
  expect(control(app, 'due').props.accessibilityState.expanded).toBe(false);
});
it('closes the iOS picker after a selection', async () => {
  const previous = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    const change = jest.fn();
    const app = await renderApp(
      <DateField label="Due" testID="due" value="" onChange={change} />,
    );
    await press(app, 'due');
    await act(async () => {
      control(app, 'due.picker').props.onValueChange({}, new Date(2026, 9, 5));
    });
    expect(control(app, 'due').props.accessibilityState.expanded).toBe(false);
  } finally {
    Object.assign(Platform, { OS: previous });
  }
});
it('avoids duplicate protected titles and keeps auth page headings accessible', async () => {
  (useSegments as jest.Mock).mockReturnValueOnce(['(auth)']);
  const auth = await renderApp(<H1>Sign in</H1>);
  expect(textContent(auth)).toContain('Sign in');
  const protectedPage = await renderApp(<H1>Properties</H1>);
  expect(textContent(protectedPage)).toBe('null');
});
