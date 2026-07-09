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

    await element(by.id('tab.properties')).tap();
    await waitFor(element(by.id('owner.addProperty.owner-1')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('owner.addProperty.owner-1')).tap();

    await element(by.id('propertyCreate.name')).replaceText(uniqueName);
    await element(by.id('propertyCreate.street')).replaceText('Avenida Test');
    await element(by.id('propertyCreate.number')).replaceText('123');
    await device.pressBack();
    await waitFor(element(by.id('propertyCreate.city')))
      .toBeVisible()
      .whileElement(by.id('propertyCreate.scroll'))
      .scroll(220, 'down');
    await element(by.id('propertyCreate.city')).replaceText('CABA');
    await waitFor(element(by.id('propertyCreate.state')))
      .toBeVisible()
      .whileElement(by.id('propertyCreate.scroll'))
      .scroll(120, 'down');
    await element(by.id('propertyCreate.state')).replaceText('Buenos Aires');
    await waitFor(element(by.id('propertyCreate.zipCode')))
      .toBeVisible()
      .whileElement(by.id('propertyCreate.scroll'))
      .scroll(220, 'down');
    await element(by.id('propertyCreate.zipCode')).replaceText('1000');
    await waitFor(element(by.id('propertyCreate.country')))
      .toBeVisible()
      .whileElement(by.id('propertyCreate.scroll'))
      .scroll(220, 'down');
    await element(by.id('propertyCreate.country')).replaceText('Argentina');

    await waitFor(element(by.id('propertyCreate.submit')))
      .toBeVisible()
      .whileElement(by.id('propertyCreate.scroll'))
      .scroll(220, 'down');
    await element(by.id('propertyCreate.submit')).tap();

    await waitFor(element(by.id('propertyDetail.edit')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('propertyDetail.edit')).tap();
    await waitFor(element(by.id('propertyEdit.name')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('propertyEdit.name')).replaceText(updatedName);
    await waitFor(element(by.id('propertyEdit.submit')))
      .toBeVisible()
      .whileElement(by.id('propertyEdit.scroll'))
      .scroll(220, 'down');
    await element(by.id('propertyEdit.submit')).tap();

    await waitFor(element(by.text(updatedName)))
      .toBeVisible()
      .withTimeout(15000);

    await tapAndConfirmDeletion('propertyDetail.delete');
    await waitFor(element(by.id('owner.addProperty.owner-1')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
