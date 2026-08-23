import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CreateUnitDto } from './dto/create-unit.dto';
import { QueryUnitsDto } from './dto/query-units.dto';
import { UnitResponseDto } from './dto/unit-response.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UpdateUnitStatusDto } from './dto/update-unit-status.dto';
import { UnitsService } from './units.service';

@ApiTags('Units')
@ApiBearerAuth()
@Auth()
@Controller('masters/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOkResponse({ type: UnitResponseDto, isArray: true })
  findAll(@Query() query: QueryUnitsDto): Promise<UnitResponseDto[]> {
    return this.unitsService.findAll(query);
  }

  @Post()
  @ApiCreatedResponse({ type: UnitResponseDto })
  create(@Body() dto: CreateUnitDto): Promise<UnitResponseDto> {
    return this.unitsService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiNotFoundResponse({ description: 'Unit was not found' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUnitDto,
  ): Promise<UnitResponseDto> {
    return this.unitsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiNotFoundResponse({ description: 'Unit was not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUnitStatusDto,
  ): Promise<UnitResponseDto> {
    return this.unitsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Unit deleted' })
  @ApiConflictResponse({ description: 'The unit is referenced by business data' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.unitsService.remove(id);
  }
}
