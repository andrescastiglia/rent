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
  if (device.getPlatform() === 'ios') {
    await device.disableSynchronization();
  }
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
    if (device.getPlatform() === 'ios') {
      await device.enableSynchronization();
    }
    return;
  }

  if (!(await isVisible('login.email', 30000))) {
    // React Native/Hermes can terminate during a cold start on the CI emulator.
    // Re-establish the Detox instrumentation before retrying the login flow.
    await relaunchFreshApp();
    if (await isVisible('tab.home', 10000)) {
      if (device.getPlatform() === 'ios') {
        await device.enableSynchronization();
      }
      return;
    }
  }

  await waitFor(element(by.id('login.email')))
    .toBeVisible()
    .withTimeout(30000);

  await element(by.id('login.email')).replaceText('admin@example.com');
  await element(by.id('login.password')).replaceText('admin123');

  await element(by.id('login.submit')).tap();

  await waitFor(element(by.id('tab.home')))
    .toBeVisible()
    .withTimeout(20000);
  if (device.getPlatform() === 'ios') {
    await device.enableSynchronization();
  }
}

export async function tapAndConfirmDeletion(
  deleteButtonId: string,
): Promise<void> {
  await element(by.id(deleteButtonId)).tap();

  const androidPositiveButton = element(by.id('android:id/button1'));
  const hasAndroidPositiveButton = await waitFor(androidPositiveButton)
    .toBeVisible()
    .withTimeout(1000)
    .then(() => true)
    .catch(() => false);
  if (hasAndroidPositiveButton) {
    await androidPositiveButton.tap();
    return;
  }

  try {
    await waitFor(element(by.text('Eliminar')).atIndex(1))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('Eliminar')).atIndex(1).tap();
  } catch {
    await waitFor(element(by.text('Eliminar')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('Eliminar')).tap();
  }
}

export async function dismissNativeAlertIfVisible(): Promise<void> {
  const androidPositiveButton = element(by.id('android:id/button1'));
  const hasAndroidPositiveButton = await waitFor(androidPositiveButton)
    .toBeVisible()
    .withTimeout(1200)
    .then(() => true)
    .catch(() => false);
  if (hasAndroidPositiveButton) {
    await androidPositiveButton.tap();
    return;
  }

  const commonButtons = ['OK', 'Aceptar', 'Cerrar', 'Entendido'];
  for (const label of commonButtons) {
    const button = element(by.text(label));
    const isVisible = await waitFor(button)
      .toBeVisible()
      .withTimeout(700)
      .then(() => true)
      .catch(() => false);
    if (isVisible) {
      await button.tap();
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
export async function waitForFormControl(
  testId: string,
  scrollViewTestId: string,
): Promise<void> {
  const target = waitFor(element(by.id(testId)));
  const visible =
    device.getPlatform() === 'ios'
      ? target.toBeVisible(100)
      : target.toBeVisible();
  await visible
    .whileElement(by.id(scrollViewTestId))
    .scroll(120, 'down', 0.5, 0.5);
}
