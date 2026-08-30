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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CreateSizeChartDto } from './dto/create-size-chart.dto';
import { QuerySizeChartsDto } from './dto/query-size-charts.dto';
import { SizeChartResponseDto } from './dto/size-chart-response.dto';
import { UpdateSizeChartStatusDto } from './dto/update-size-chart-status.dto';
import { UpdateSizeChartDto } from './dto/update-size-chart.dto';
import { SizeChartsService } from './size-charts.service';

@ApiTags('Size Charts')
@ApiBearerAuth()
@Auth()
@Controller('masters/size-charts')
export class SizeChartsController {
  constructor(private readonly sizeChartsService: SizeChartsService) {}

  @Get()
  @ApiOkResponse({ type: SizeChartResponseDto, isArray: true })
  findAll(@Query() query: QuerySizeChartsDto): Promise<SizeChartResponseDto[]> {
    return this.sizeChartsService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: SizeChartResponseDto })
  @ApiNotFoundResponse({ description: 'Size chart was not found' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<SizeChartResponseDto> {
    return this.sizeChartsService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: SizeChartResponseDto })
  @ApiBadRequestResponse({ description: 'Size chart data is invalid' })
  @ApiConflictResponse({ description: 'Size chart name already exists' })
  create(@Body() dto: CreateSizeChartDto): Promise<SizeChartResponseDto> {
    return this.sizeChartsService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SizeChartResponseDto })
  @ApiBadRequestResponse({ description: 'Size chart data is invalid' })
  @ApiConflictResponse({ description: 'Size chart name already exists' })
  @ApiNotFoundResponse({ description: 'Size chart was not found' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSizeChartDto,
  ): Promise<SizeChartResponseDto> {
    return this.sizeChartsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: SizeChartResponseDto })
  @ApiNotFoundResponse({ description: 'Size chart was not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSizeChartStatusDto,
  ): Promise<SizeChartResponseDto> {
    return this.sizeChartsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Size chart deleted' })
  @ApiConflictResponse({
    description: 'Business data references this size chart',
  })
  @ApiNotFoundResponse({ description: 'Size chart was not found' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.sizeChartsService.remove(id);
  }
}
