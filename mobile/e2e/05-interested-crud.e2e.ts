import { loginAsAdmin, relaunchFreshApp, tapAndConfirmDeletion } from './helpers';

describe('Interested CRUD', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('creates, edits and deletes an interested profile', async () => {
    const stamp = Date.now().toString();
    const email = `interested.${stamp}@example.com`;
    const updatedEmail = `interested.updated.${stamp}@example.com`;

    await element(by.id('tab.interested')).tap();

    await waitFor(element(by.id('interested.new'))).toBeVisible().withTimeout(15000);
    await element(by.id('interested.new')).tap();

    await element(by.id('interestedCreate.firstName')).replaceText('E2E');
    await element(by.id('interestedCreate.lastName')).replaceText('Interested');
    await element(by.id('interestedCreate.phone')).replaceText('+5491111111111');
    await element(by.id('interestedCreate.email')).replaceText(email);
    await element(by.id('interestedCreate.operation.sale')).tap();

    await waitFor(element(by.id('interestedCreate.submit')))
      .toBeVisible()
      .whileElement(by.id('interestedCreate.scroll'))
      .scroll(240, 'down');
    await element(by.id('interestedCreate.submit')).tap();

    await waitFor(element(by.id('interestedDetail.edit'))).toBeVisible().withTimeout(15000);

    await element(by.id('interestedDetail.edit')).tap();
    await waitFor(element(by.id('interestedEdit.email'))).toBeVisible().withTimeout(10000);
    await element(by.id('interestedEdit.email')).replaceText(updatedEmail);

    await waitFor(element(by.id('interestedEdit.submit')))
      .toBeVisible()
      .whileElement(by.id('interestedEdit.scroll'))
      .scroll(240, 'down');
    await element(by.id('interestedEdit.submit')).tap();

    await waitFor(element(by.text(updatedEmail))).toBeVisible().withTimeout(15000);

    await tapAndConfirmDeletion('interestedDetail.delete');
    await waitFor(element(by.id('interested.new'))).toBeVisible().withTimeout(15000);
  });
});
