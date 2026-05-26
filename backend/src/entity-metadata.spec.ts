import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { Buyer } from './buyers/entities/buyer.entity';
import { InterestedProfile } from './interested/entities/interested-profile.entity';
import { LeaseContractTemplate } from './leases/entities/lease-contract-template.entity';
import { User } from './users/entities/user.entity';
import './app.module';

describe('Entity metadata', () => {
  type EntityClass = abstract new (...args: never[]) => object;

  const expectColumnType = (
    entity: EntityClass,
    propertyName: string,
    expectedType: string,
  ) => {
    const column = getMetadataArgsStorage().columns.find(
      (item) => item.target === entity && item.propertyName === propertyName,
    );

    expect(column).toBeDefined();
    expect(column?.options.type).toBe(expectedType);
  };

  it('defines explicit runtime-safe types for nullable string and UUID unions', () => {
    expectColumnType(User, 'email', 'varchar');
    expectColumnType(Buyer, 'dni', 'varchar');
    expectColumnType(InterestedProfile, 'convertedToTenantId', 'uuid');
    expectColumnType(InterestedProfile, 'convertedToBuyerId', 'uuid');
    expectColumnType(InterestedProfile, 'convertedToSaleAgreementId', 'uuid');
    expectColumnType(LeaseContractTemplate, 'sourceFileName', 'varchar');
    expectColumnType(LeaseContractTemplate, 'sourceMimeType', 'varchar');
  });

  it('does not rely on reflected Object types for database columns', () => {
    const unsafeColumns = getMetadataArgsStorage()
      .columns.filter((column) => {
        const reflectedType = Reflect.getMetadata(
          'design:type',
          column.target,
          column.propertyName,
        );

        return reflectedType === Object && column.options.type === undefined;
      })
      .map((column) => {
        const target =
          typeof column.target === 'function'
            ? column.target.name
            : String(column.target);

        return `${target}.${column.propertyName}`;
      });

    expect(unsafeColumns).toEqual([]);
  });
});
