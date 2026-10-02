import {
  fillField,
  fillPasswordField,
  dismissNativeAlertIfVisible,
  waitForFormControl,
  loginAsAdmin,
  relaunchFreshApp,
  openModule,
  tapAndConfirmDeletion,
} from './helpers';

describe('Users and templates critical flows', () => {
  beforeEach(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('users flow: create, edit, reset password and toggle activation', async () => {
    const stamp = Date.now().toString();
    const email = `e2e.user.${stamp}@example.com`;

    await openModule('users');

    await waitFor(element(by.id('users.new')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('users.new')).tap();
    await waitFor(element(by.id('userCreate.email')))
      .toBeVisible()
      .withTimeout(15000);

    await fillField('userCreate.email', email, 'userCreate.scroll');
    await fillPasswordField(
      'userCreate.password',
      'SecurePass123!',
      'userCreate.scroll',
    );
    await fillField('userCreate.firstName', 'E2E', 'userCreate.scroll');
    await fillField('userCreate.lastName', 'User', 'userCreate.scroll');
    await fillField('userCreate.phone', '+5491100000000', 'userCreate.scroll');
    await waitForFormControl('userCreate.role.owner', 'userCreate.scroll');
    await element(by.id('userCreate.role.owner')).tap();

    await waitForFormControl('userCreate.submit', 'userCreate.scroll');
    await element(by.id('userCreate.submit')).tap();

    await waitFor(element(by.id('userDetail.edit')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('userDetail.resetPassword')).tap();
    await waitFor(element(by.id('userResetPassword.newPassword')))
      .toBeVisible()
      .withTimeout(10000);
    await fillPasswordField(
      'userResetPassword.newPassword',
      'SecurePass456!',
      'userResetPassword.scroll',
    );
    await element(by.id('userResetPassword.submit')).tap();
    await dismissNativeAlertIfVisible();

    await waitFor(element(by.id('userDetail.toggleActivation')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('userDetail.toggleActivation')).tap();

    await waitFor(element(by.id('userDetail.edit')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('userDetail.edit')).tap();
    await waitFor(element(by.id('userEdit.firstName')))
      .toBeVisible()
      .withTimeout(10000);
    await fillField('userEdit.firstName', 'E2EUpdated', 'userEdit.scroll');

    await waitForFormControl('userEdit.submit', 'userEdit.scroll');
    await element(by.id('userEdit.submit')).tap();

    await waitFor(element(by.text('E2EUpdated User')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('templates flow: create, edit and delete payment template', async () => {
    const stamp = Date.now().toString();
    const templateName = `Template E2E ${stamp}`;
    const updatedTemplateName = `${templateName} Updated`;

    await openModule('templates');

    await waitFor(element(by.id('templates.new')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('templates.new')).tap();

    await waitFor(element(by.id('templateCreate.kind.payment')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('templateCreate.kind.payment')).tap();
    await waitFor(element(by.id('templateCreate.paymentType.receipt')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('templateCreate.paymentType.receipt')).tap();
    await fillField(
      'templateCreate.name',
      templateName,
      'templateCreate.scroll',
    );
    await fillField(
      'templateCreate.templateBody',
      'Contenido base E2E {{receipt.number}}',
      'templateCreate.scroll',
    );
    await waitForFormControl(
      'templateCreate.isDefault.yes',
      'templateCreate.scroll',
    );
    await element(by.id('templateCreate.isDefault.yes')).tap();

    await waitForFormControl('templateCreate.submit', 'templateCreate.scroll');
    await element(by.id('templateCreate.submit')).tap();

    await waitForFormControl('templateDetail.edit', 'templateDetail.scroll');

    await element(by.id('templateDetail.edit')).tap();
    await waitFor(element(by.id('templateEdit.name')))
      .toBeVisible()
      .withTimeout(10000);
    await fillField(
      'templateEdit.name',
      updatedTemplateName,
      'templateEdit.scroll',
    );
    await waitForFormControl('templateEdit.isActive.no', 'templateEdit.scroll');
    await element(by.id('templateEdit.isActive.no')).tap();

    await waitForFormControl('templateEdit.submit', 'templateEdit.scroll');
    await element(by.id('templateEdit.submit')).tap();

    await waitFor(element(by.id('templateDetail.delete')))
      .toBeVisible()
      .withTimeout(15000);
    await waitFor(element(by.text(updatedTemplateName)))
      .toBeVisible()
      .withTimeout(15000);

    await tapAndConfirmDeletion(
      'templateDetail.delete',
      'templateDetail.scroll',
    );
    await waitFor(element(by.id('templates.new')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
