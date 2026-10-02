import { fillField, openModule, waitForFormControl } from './helpers';
import {
  loginAsAdmin,
  relaunchFreshApp,
  tapAndConfirmDeletion,
} from './helpers';

describe('Interested CRUD', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('creates, edits and deletes an interested profile', async () => {
    const stamp = Date.now().toString();
    const email = `interested.${stamp}@example.com`;
    const updatedEmail = `interested.updated.${stamp}@example.com`;

    await openModule('interested');

    await waitFor(element(by.id('interested.new')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('interested.new')).tap();
    await waitFor(element(by.id('interestedCreate.firstName')))
      .toBeVisible()
      .withTimeout(15000);

    await fillField('interestedCreate.firstName', 'E2E');
    await fillField('interestedCreate.lastName', 'Interested');
    await fillField('interestedCreate.phone', '+5491111111111');
    await fillField('interestedCreate.email', email);
    await waitForFormControl(
      'interestedCreate.operation.sale',
      'interestedCreate.scroll',
    );
    await element(by.id('interestedCreate.operation.sale')).tap();

    await waitForFormControl(
      'interestedCreate.submit',
      'interestedCreate.scroll',
    );
    await element(by.id('interestedCreate.submit')).tap();

    await waitFor(element(by.id('interestedDetail.edit')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('interestedDetail.edit')).tap();
    await waitFor(element(by.id('interestedEdit.email')))
      .toBeVisible()
      .withTimeout(10000);
    await fillField('interestedEdit.email', updatedEmail);

    await waitForFormControl('interestedEdit.submit', 'interestedEdit.scroll');
    await element(by.id('interestedEdit.submit')).tap();

    await waitFor(element(by.text(updatedEmail)))
      .toBeVisible()
      .withTimeout(15000);

    await tapAndConfirmDeletion('interestedDetail.delete');
    await waitFor(element(by.id('interested.new')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
