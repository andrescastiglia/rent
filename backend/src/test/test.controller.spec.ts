import { TestController } from './test.controller';

describe('TestController', () => {
  const controller = new TestController();

  it('returns expected static payloads', () => {
    expect(controller.adminOnly()).toEqual({
      message: 'This endpoint is only accessible by admins',
    });
    expect(controller.ownerOnly()).toEqual({
      message: 'This endpoint is only accessible by owners',
    });
    expect(controller.tenantOnly()).toEqual({
      message: 'This endpoint is only accessible by tenants',
    });
    expect(controller.adminOrOwner()).toEqual({
      message: 'This endpoint is accessible by admins or owners',
    });
    expect(controller.createUserPermission()).toEqual({
      message: 'This endpoint requires permission to create users',
    });
  });
});
