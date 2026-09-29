import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  PortalCandidateDto,
  PortalResolutionDto,
  ResolvePortalPublicationDto,
} from './dto/resolve-portal-publication.dto';
import { PortalPublicationReviewService } from './portal-publication-review.service';
type Actor = { user: { id: string; companyId: string } };
@Controller('portals/listings/:listingId')
@Roles(UserRole.ADMIN)
export class PortalPublicationReviewController {
  constructor(private readonly reviews: PortalPublicationReviewService) {}
  @Get('operations/:jobId/candidate/:externalId')
  @ApiOkResponse({ type: PortalCandidateDto })
  candidate(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('externalId') externalId: string,
    @Request() req: Actor,
  ) {
    return this.reviews.candidate(
      req.user.companyId,
      listingId,
      jobId,
      externalId,
    );
  }
  @Post('operations/:jobId/resolve')
  @ApiCreatedResponse({ type: PortalResolutionDto })
  resolve(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: ResolvePortalPublicationDto,
    @Request() req: Actor,
  ) {
    return this.reviews.resolve(
      req.user.companyId,
      req.user.id,
      listingId,
      jobId,
      dto,
    );
  }
  @Get('resolutions')
  @ApiOkResponse({ type: PortalResolutionDto, isArray: true })
  history(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Request() req: Actor,
  ) {
    return this.reviews.history(req.user.companyId, listingId);
  }
}
