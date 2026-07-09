export async function relaunchFreshApp(): Promise<void> {
  await device.launchApp({
    newInstance: true,
    launchArgs: {
      detoxEnableSynchronization: '0',
    },
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginAsAdmin(): Promise<void> {
  const isAlreadyLoggedIn = await waitFor(element(by.id('tab.properties')))
    .toBeVisible()
    .withTimeout(10000)
    .then(() => true)
    .catch(() => false);

  if (isAlreadyLoggedIn) {
    return;
  }

  await waitFor(element(by.id('login.email')))
    .toBeVisible()
    .withTimeout(30000);

  await element(by.id('login.email')).replaceText('admin@example.com');
  await element(by.id('login.password')).replaceText('admin123');

  await element(by.id('login.submit')).tap();

  await sleep(1500);
  await relaunchFreshApp();

  await waitFor(element(by.id('tab.properties')))
    .toBeVisible()
    .withTimeout(20000);
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
