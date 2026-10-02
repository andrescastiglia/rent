export async function relaunchFreshApp(): Promise<void> {
  await device.launchApp({
    newInstance: true,
    ...(device.getPlatform() === 'ios'
      ? { languageAndLocale: { language: 'es', locale: 'es_AR' } }
      : {}),
    launchArgs: {
      detoxEnableSynchronization: '0',
    },
  });
  await device.disableSynchronization();
}

async function isVisible(testId: string, timeout: number): Promise<boolean> {
  return waitFor(element(by.id(testId)))
    .toBeVisible()
    .withTimeout(timeout)
    .then(() => true)
    .catch(() => false);
}

export async function loginAsAdmin(): Promise<void> {
  if (await isVisible('tab.home', 10000)) {
    await device.enableSynchronization();
    return;
  }

  if (!(await isVisible('login.email', 30000))) {
    // React Native/Hermes can terminate during a cold start on the CI emulator.
    // Re-establish the Detox instrumentation before retrying the login flow.
    await relaunchFreshApp();
    if (await isVisible('tab.home', 10000)) {
      await device.enableSynchronization();
      return;
    }
  }

  await waitFor(element(by.id('login.email')))
    .toBeVisible()
    .withTimeout(30000);
  await device.enableSynchronization();
  await fillField('login.email', 'admin@example.com');
  await fillField('login.password', 'admin123');

  await element(by.id('login.submit')).tap();

  await waitFor(element(by.id('tab.home')))
    .toBeVisible()
    .withTimeout(20000);
}

/** Real keyboard events also update React state before the next action. */
export async function fillField(
  testId: string,
  value: string,
  scrollViewTestId?: string,
): Promise<void> {
  if (scrollViewTestId) {
    await waitForFormControl(testId, scrollViewTestId);
  } else {
    await dismissKeyboardIfVisible();
  }
  const field = element(by.id(testId));
  await field.tap();
  await waitFor(field).toBeFocused().withTimeout(5000);
  await field.clearText();
  await waitFor(field).toHaveText('').withTimeout(5000);
  await field.typeText(value);
  await waitFor(field).toHaveText(value).withTimeout(5000);
}

export async function tapAndConfirmDeletion(
  deleteButtonId: string,
  scrollViewTestId: string,
): Promise<void> {
  // Updated text can already be present in the edit field; wait for the detail
  // action so deletion starts only after saving and navigation complete.
  await waitFor(element(by.id(scrollViewTestId)))
    .toExist()
    .withTimeout(15000);
  await waitForFormControl(deleteButtonId, scrollViewTestId);
  await element(by.id(deleteButtonId)).tap();

  const confirmation = element(
    device.getPlatform() === 'android'
      ? by.text('Eliminar').and(by.type('android.widget.Button'))
      : by.label('Eliminar').and(by.type('_UIAlertControllerActionView')),
  );
  await waitFor(confirmation).toBeVisible().withTimeout(5000);
  await confirmation.tap();
  await waitFor(confirmation).not.toExist().withTimeout(5000);
}

export async function dismissNativeAlertIfVisible(): Promise<void> {
  const commonButtons = ['OK', 'Aceptar', 'Cerrar', 'Entendido'];
  for (const label of commonButtons) {
    const button = element(
      device.getPlatform() === 'android'
        ? by.text(label).and(by.type('android.widget.Button'))
        : by.label(label).and(by.type('_UIAlertControllerActionView')),
    );
    const isVisible = await waitFor(button)
      .toBeVisible()
      .withTimeout(700)
      .then(() => true)
      .catch(() => false);
    if (isVisible) {
      await button.tap();
      await waitFor(button).not.toExist().withTimeout(5000);
      return;
    }
  }
}

export async function openModule(module: string): Promise<void> {
  await element(by.id('tab.more')).tap();
  await waitFor(element(by.id('more.scroll')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('more.scroll')).scrollTo('top');
  await waitFor(element(by.id(`more.${module}`)))
    .toBeVisible()
    .whileElement(by.id('more.scroll'))
    .scroll(240, 'down');
  await element(by.id(`more.${module}`)).tap();
}

/** Scroll from the visible middle of the form, above the iOS keyboard. */
async function dismissKeyboardIfVisible(): Promise<void> {
  // Numeric iOS keyboards have no return key. Close the keyboard explicitly
  // and wait for the final layout before locating the next form action.
  if (await isVisible('screen.dismissKeyboard', 500)) {
    await element(by.id('screen.dismissKeyboard')).tap();
    await waitFor(element(by.id('screen.dismissKeyboard')))
      .not.toExist()
      .withTimeout(5000);
  }
}

export async function waitForFormControl(
  testId: string,
  scrollViewTestId: string,
): Promise<void> {
  await waitFor(element(by.id(scrollViewTestId)))
    .toExist()
    .withTimeout(15000);
  await dismissKeyboardIfVisible();
  // Use Detox's visibility predicate; tap() separately checks the activation
  // point. A 100% pixel threshold rejects visible rounded choice controls.
  await waitFor(element(by.id(testId)))
    .toBeVisible()
    .whileElement(by.id(scrollViewTestId))
    .scroll(240, 'down', 0.5, 0.5);
  // A scroll gesture can focus an input beneath its end point on iOS.
  // Stabilize the expanded viewport before the caller taps the target.
  await dismissKeyboardIfVisible();
  await waitFor(element(by.id(testId)))
    .toBeVisible()
    .withTimeout(5000);
}
