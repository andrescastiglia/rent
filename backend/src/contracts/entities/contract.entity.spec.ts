import {
  Contract,
  ContractSignatureStatus,
  ContractStatus,
  ContractType,
} from './contract.entity';
import {
  Contract as LegacyContract,
  LeaseStatus,
} from '../../leases/entities/lease.entity';

describe('canonical contract exports', () => {
  it('maps the canonical names to the compatibility entity and enums', () => {
    expect(Contract).toBe(LegacyContract);
    expect(ContractStatus).toBe(LeaseStatus);
    expect(ContractType.RENTAL).toBe('rental');
    expect(ContractSignatureStatus.NOT_STARTED).toBe('not_started');
  });
});
