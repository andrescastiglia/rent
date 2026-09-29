import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Request,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SettlementsService } from './settlements.service';
import { SettlementPayoutEffectsService } from './settlement-payout-effects.service';
@Controller('settlements')
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
@Authenticated('settlements')
export class SettlementPayoutReceiptsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly effects: SettlementPayoutEffectsService,
  ) {}
  @Get(':id/payout/movements/:movementId/receipt')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('movementId', ParseUUIDPipe) movementId: string,
    @Request()
    req: {
      user: {
        id: string;
        companyId: string;
        role: UserRole;
        roles?: UserRole[];
      };
    },
  ) {
    await this.settlements.findOne(id, req.user.companyId, req.user);
    const receipt = await this.effects.download(
      id,
      movementId,
      req.user.companyId,
    );
    return new StreamableFile(receipt.buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${receipt.filename}"`,
      length: receipt.buffer.length,
    });
  }
}
