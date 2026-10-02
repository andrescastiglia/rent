import {
  Headers,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { DiscardPropertyImagesDto } from './dto/discard-property-images.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyFiltersDto } from './dto/property-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'))
@Controller('properties')
@Authenticated('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(
    @Body() createPropertyDto: CreatePropertyDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.propertiesService.create(
      createPropertyDto,
      {
        id: req.user.id,
        role: req.user.role,
        roles: req.user.roles,
        companyId: req.user.companyId,
      },
      executionKey,
    );
  }

  @Get()
  findAll(@Query() filters: PropertyFiltersDto, @Request() req: any) {
    return this.propertiesService.findAll(filters, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.propertiesService.findOneScoped(id, req.user);
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.propertiesService.update(
      id,
      updatePropertyDto,
      req.user,
      executionKey,
    );
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async remove(
    @Param('id') id: string,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    await this.propertiesService.remove(id, req.user, executionKey);
    return { message: 'Property deleted successfully' };
  }

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  uploadPropertyImage(@UploadedFile() file: any, @Request() req: any) {
    return this.propertiesService.uploadPropertyImage(file, {
      id: req.user.id,
      role: req.user.role,
      roles: req.user.roles,
      companyId: req.user.companyId,
    });
  }

  @Post('uploads/discard')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  discardUploadedImages(
    @Body() dto: DiscardPropertyImagesDto,
    @Request() req: any,
  ) {
    return this.propertiesService.discardUploadedImages(dto.images, {
      id: req.user.id,
      role: req.user.role,
      roles: req.user.roles,
      companyId: req.user.companyId,
    });
  }
}
