import { ContactDataPrivacyInterceptor } from './contact-data-privacy.interceptor';
import { SelfServiceAction } from '../common/decorators/self-service-action.decorator';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { ContactDataService, GeoActor } from './contact-data.service';
import {
  AddressSearchDto,
  EtaDto,
  NearbyDto,
  PhonePreviewDto,
  PhonePreviewResultDto,
  GeoDestinationDto,
  EtaResultDto,
  PlaceSearchDto,
  RegisteredPlaceDto,
  GeoConfigDto,
  AddressSearchResultDto,
  NearbyResultDto,
  ContactHistoryDto,
  ArrivalOpenedDto,
  locationRefSchema,
} from './contact-data.dto';
import { previewPhone } from './phone';
@UseInterceptors(ContactDataPrivacyInterceptor)
@ApiTags('Contact data')
@ApiBearerAuth()
@Controller('contact-data')
@Authenticated('self-service')
export class ContactDataController {
  constructor(private readonly service: ContactDataService) {}
  @ApiOkResponse({ type: GeoConfigDto })
  @Get('config')
  @Header('Cache-Control', 'no-store')
  config(@Request() req: { user: GeoActor }) {
    return this.service.configuration(req.user);
  }
  @ApiOkResponse({ type: PhonePreviewResultDto })
  @SelfServiceAction('phone.preview')
  @HttpCode(200)
  @Post('phone-preview')
  @Header('Cache-Control', 'no-store')
  phone(@Request() req: { user: GeoActor }, @Body() input: PhonePreviewDto) {
    return previewPhone(input.value, input.country);
  }
  @ApiOkResponse({ type: AddressSearchResultDto })
  @HttpCode(200)
  @Post('address-search')
  @Header('Cache-Control', 'no-store')
  search(@Request() req: { user: GeoActor }, @Body() input: AddressSearchDto) {
    return this.service.search(req.user, input);
  }
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/GeoDestinationDto' },
        { type: 'object', nullable: true },
      ],
    },
  })
  @Get('entries/:entryId/destination')
  @Header('Cache-Control', 'no-store')
  entry(@Request() req: { user: GeoActor }, @Param('entryId') id: string) {
    return this.service.entryDestination(req.user, id);
  }
  @ApiOkResponse({ type: RegisteredPlaceDto, isArray: true })
  @HttpCode(200)
  @Post('places-search')
  places(@Request() req: { user: GeoActor }, @Body() input: PlaceSearchDto) {
    return this.service.places(req.user, input.search ?? '');
  }
  @ApiOkResponse({ type: GeoDestinationDto })
  @Get('locations/:type/:id')
  @Header('Cache-Control', 'no-store')
  destination(
    @Request() req: { user: GeoActor },
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.destination(req.user, parseRef(type, id));
  }
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Get('locations/:type/:id/image')
  async image(
    @Request() req: { user: GeoActor },
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const bytes = await this.service.image(req.user, parseRef(type, id));
    res
      .set({
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'image/jpeg',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
  @ApiOkResponse({ type: EtaResultDto })
  @SelfServiceAction('geo.eta')
  @HttpCode(200)
  @Post('eta')
  @Header('Cache-Control', 'no-store')
  eta(@Request() req: { user: GeoActor }, @Body() input: EtaDto) {
    return this.service.eta(req.user, input);
  }
  @ApiOkResponse({ type: NearbyResultDto })
  @HttpCode(200)
  @Post('nearby')
  @Header('Cache-Control', 'no-store')
  nearby(@Request() req: { user: GeoActor }, @Body() input: NearbyDto) {
    return this.service.nearby(req.user, input);
  }
  @ApiOkResponse({ type: ContactHistoryDto })
  @Get('people/:type/:id/history')
  @Header('Cache-Control', 'no-store')
  history(
    @Request() req: { user: GeoActor },
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.history(req.user, parseRef(type, id));
  }
  @ApiOkResponse({ type: ArrivalOpenedDto })
  @HttpCode(200)
  @Post('people/:type/:id/arrival-opened')
  arrival(
    @Request() req: { user: GeoActor },
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.arrivalOpened(req.user, parseRef(type, id));
  }
}

function parseRef(type: string, id: string) {
  const result = locationRefSchema.safeParse({ type, id });
  if (!result.success) throw new BadRequestException('Destino inválido');
  return result.data;
}
