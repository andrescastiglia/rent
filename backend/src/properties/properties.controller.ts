import {
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
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { DiscardPropertyImagesDto } from './dto/discard-property-images.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyFiltersDto } from './dto/property-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'))
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(@Body() createPropertyDto: CreatePropertyDto, @Request() req: any) {
    return this.propertiesService.create(createPropertyDto, {
      id: req.user.id,
      role: req.user.role,
      companyId: req.user.companyId,
    });
  }

  @Get()
  findAll(@Query() filters: PropertyFiltersDto) {
    return this.propertiesService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  update(
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @Request() req: any,
  ) {
    return this.propertiesService.update(
      id,
      updatePropertyDto,
      req.user.id,
      req.user.role,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.propertiesService.remove(id, req.user.id, req.user.role);
    return { message: 'Property deleted successfully' };
  }

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  uploadPropertyImage(@UploadedFile() file: any, @Request() req: any) {
    return this.propertiesService.uploadPropertyImage(file, {
      id: req.user.id,
      role: req.user.role,
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
      companyId: req.user.companyId,
    });
  }
}
