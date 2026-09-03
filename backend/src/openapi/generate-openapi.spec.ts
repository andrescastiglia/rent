import { createOperationId } from './generate-openapi';

describe('createOperationId', () => {
  it('keeps ordinary controller methods stable', () => {
    expect(createOperationId('UsersController', 'findAll')).toBe(
      'Users_findAll',
    );
  });

  it('uses the canonical name for the first route in a controller alias', () => {
    expect(createOperationId('LeasesController', 'create[0]')).toBe(
      'Leases_create',
    );
  });

  it('marks the second route in a controller alias as legacy', () => {
    expect(createOperationId('LeasesController', 'create[1]')).toBe(
      'Leases_createLegacy',
    );
  });
});
