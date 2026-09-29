import { Controller, Get, Param, Request } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MercadoLibreCatalogService } from './mercadolibre-catalog.service';
import {
  MercadoLibreCategoryDto,
  MercadoLibreOptionDto,
} from './dto/mercadolibre-catalog.dto';
type Actor = { user: { companyId: string } };
@Controller('portals/mercadolibre/catalog')
@Roles(UserRole.ADMIN)
export class MercadoLibreCatalogController {
  constructor(private readonly catalog: MercadoLibreCatalogService) {}
  @Get('categories/:id')
  @ApiOkResponse({ type: MercadoLibreCategoryDto })
  category(@Param('id') id: string, @Request() req: Actor) {
    return this.catalog.category(req.user.companyId, id);
  }
  @Get('states')
  @ApiOkResponse({ type: MercadoLibreOptionDto, isArray: true })
  states(@Request() req: Actor) {
    return this.catalog.states(req.user.companyId);
  }
  @Get('states/:id/cities')
  @ApiOkResponse({ type: MercadoLibreOptionDto, isArray: true })
  cities(@Param('id') id: string, @Request() req: Actor) {
    return this.catalog.cities(req.user.companyId, id);
  }
  @Get('cities/:id/neighborhoods')
  @ApiOkResponse({ type: MercadoLibreOptionDto, isArray: true })
  neighborhoods(@Param('id') id: string, @Request() req: Actor) {
    return this.catalog.neighborhoods(req.user.companyId, id);
  }
}
