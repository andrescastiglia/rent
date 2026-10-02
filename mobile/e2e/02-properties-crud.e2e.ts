import { fillField, openModule, waitForFormControl } from './helpers';
import {
  loginAsAdmin,
  relaunchFreshApp,
  tapAndConfirmDeletion,
} from './helpers';

describe('Properties CRUD', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('creates, edits and deletes a property', async () => {
    const uniqueName = `E2E Property ${Date.now()}`;
    const updatedName = `${uniqueName} Updated`;

    await openModule('properties');
    await waitFor(element(by.id('properties.new')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('properties.new')).tap();

    await waitFor(element(by.id('propertyCreate.name')))
      .toBeVisible()
      .withTimeout(15000);
    await fillField('propertyCreate.name', uniqueName);
    await waitForFormControl('propertyCreate.ownerId', 'propertyCreate.scroll');
    await fillField('propertyCreate.ownerId', 'owner-1');
    await waitForFormControl('propertyCreate.street', 'propertyCreate.scroll');
    await fillField('propertyCreate.street', 'Avenida Test');
    await waitForFormControl('propertyCreate.number', 'propertyCreate.scroll');
    await fillField('propertyCreate.number', '123');
    await waitForFormControl('propertyCreate.city', 'propertyCreate.scroll');
    await fillField('propertyCreate.city', 'CABA');
    await waitForFormControl('propertyCreate.state', 'propertyCreate.scroll');
    await fillField('propertyCreate.state', 'Buenos Aires');
    await waitForFormControl('propertyCreate.zipCode', 'propertyCreate.scroll');
    await fillField('propertyCreate.zipCode', '1000');
    await waitForFormControl('propertyCreate.country', 'propertyCreate.scroll');
    await fillField('propertyCreate.country', 'Argentina');

    await waitForFormControl('propertyCreate.submit', 'propertyCreate.scroll');
    await element(by.id('propertyCreate.submit')).tap();

    await waitFor(element(by.id('propertyDetail.edit')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('propertyDetail.edit')).tap();
    await waitFor(element(by.id('propertyEdit.name')))
      .toBeVisible()
      .withTimeout(10000);
    await fillField('propertyEdit.name', updatedName);
    await waitForFormControl('propertyEdit.submit', 'propertyEdit.scroll');
    await element(by.id('propertyEdit.submit')).tap();

    await waitFor(element(by.text(updatedName)))
      .toBeVisible()
      .withTimeout(15000);

    await tapAndConfirmDeletion('propertyDetail.delete');
    await waitFor(element(by.id('properties.new')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
