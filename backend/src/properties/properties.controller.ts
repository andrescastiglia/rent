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
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
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
  uploadPropertyImage(@UploadedFile() file: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }

    const destination = join(process.cwd(), 'uploads', 'properties');
    if (!existsSync(destination)) {
      mkdirSync(destination, { recursive: true });
    }

    const extension = extname(file.originalname || '').toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension || '.jpg'}`;
    writeFileSync(join(destination, filename), file.buffer);

    const url = `/uploads/properties/${filename}`;
    return { url };
  }

  @Post('uploads/discard')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  discardUploadedImages(@Body() dto: DiscardPropertyImagesDto) {
    return this.propertiesService.discardUploadedImages(dto.images);
  }
}
