import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { QueryUnitsDto } from './dto/query-units.dto';
import { UnitResponseDto } from './dto/unit-response.dto';
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
}
