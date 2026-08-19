import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryUnitsDto } from '../dto/request/query-units.dto';
import { UnitResponseDto } from '../dto/response/unit-response.dto';
import { UnitsService } from '../services/units.service';

@ApiTags('Units')
@Controller('masters/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({ summary: 'List units for master-data lookups' })
  @ApiOkResponse({ type: UnitResponseDto, isArray: true })
  findAll(@Query() query: QueryUnitsDto): Promise<UnitResponseDto[]> {
    return this.unitsService.findAll(query);
  }
}
