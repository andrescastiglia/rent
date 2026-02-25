import {
  dismissNativeAlertIfVisible,
  loginAsAdmin,
  relaunchFreshApp,
} from './helpers';

describe('Users and templates critical flows', () => {
  beforeEach(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('users flow: create, edit, reset password and toggle activation', async () => {
    const stamp = Date.now().toString();
    const email = `e2e.user.${stamp}@example.com`;

    await element(by.id('tab.settings')).tap();
    await element(by.id('settings.goto.users')).tap();

    await waitFor(element(by.id('users.new'))).toBeVisible().withTimeout(15000);
    await element(by.id('users.new')).tap();

    await element(by.id('userCreate.email')).replaceText(email);
    await element(by.id('userCreate.password')).replaceText('SecurePass123!');
    await element(by.id('userCreate.firstName')).replaceText('E2E');
    await element(by.id('userCreate.lastName')).replaceText('User');
    await element(by.id('userCreate.phone')).replaceText('+5491100000000');
    await element(by.id('userCreate.role.owner')).tap();

    await waitFor(element(by.id('userCreate.submit')))
      .toBeVisible()
      .whileElement(by.id('userCreate.scroll'))
      .scroll(240, 'down');
    await element(by.id('userCreate.submit')).tap();

    await waitFor(element(by.id('userDetail.edit'))).toBeVisible().withTimeout(15000);

    await element(by.id('userDetail.resetPassword')).tap();
    await waitFor(element(by.id('userResetPassword.newPassword'))).toBeVisible().withTimeout(10000);
    await element(by.id('userResetPassword.newPassword')).replaceText('SecurePass456!');
    await element(by.id('userResetPassword.submit')).tap();
    await dismissNativeAlertIfVisible();

    await element(by.id('userDetail.toggleActivation')).tap();

    await element(by.id('userDetail.edit')).tap();
    await waitFor(element(by.id('userEdit.firstName'))).toBeVisible().withTimeout(10000);
    await element(by.id('userEdit.firstName')).replaceText('E2EUpdated');

    await waitFor(element(by.id('userEdit.submit')))
      .toBeVisible()
      .whileElement(by.id('userEdit.scroll'))
      .scroll(220, 'down');
    await element(by.id('userEdit.submit')).tap();

    await waitFor(element(by.text('E2EUpdated User'))).toBeVisible().withTimeout(15000);
  });

  it('templates flow: create, edit and delete payment template', async () => {
    const stamp = Date.now().toString();
    const templateName = `Template E2E ${stamp}`;
    const updatedTemplateName = `${templateName} Updated`;

    await element(by.id('tab.settings')).tap();
    await element(by.id('settings.goto.templates')).tap();

    await waitFor(element(by.id('templates.new'))).toBeVisible().withTimeout(15000);
    await element(by.id('templates.new')).tap();

    await element(by.id('templateCreate.kind.payment')).tap();
    await element(by.id('templateCreate.paymentType.receipt')).tap();
    await element(by.id('templateCreate.name')).replaceText(templateName);
    await element(by.id('templateCreate.templateBody')).replaceText('Contenido base E2E {{receipt.number}}');
    await element(by.id('templateCreate.isDefault.yes')).tap();

    await waitFor(element(by.id('templateCreate.submit')))
      .toBeVisible()
      .whileElement(by.id('templateCreate.scroll'))
      .scroll(220, 'down');
    await element(by.id('templateCreate.submit')).tap();

    await waitFor(element(by.id('templateDetail.edit'))).toBeVisible().withTimeout(15000);

    await element(by.id('templateDetail.edit')).tap();
    await waitFor(element(by.id('templateEdit.name'))).toBeVisible().withTimeout(10000);
    await element(by.id('templateEdit.name')).replaceText(updatedTemplateName);
    await element(by.id('templateEdit.isActive.no')).tap();

    await waitFor(element(by.id('templateEdit.submit')))
      .toBeVisible()
      .whileElement(by.id('templateEdit.scroll'))
      .scroll(220, 'down');
    await element(by.id('templateEdit.submit')).tap();

    await waitFor(element(by.text(updatedTemplateName))).toBeVisible().withTimeout(15000);

    await tapAndConfirmDeletion('templateDetail.delete');
    await waitFor(element(by.id('templates.new'))).toBeVisible().withTimeout(15000);
  });
});
