import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateBomLineDto } from '../dto/request/create-bom-line.dto';
import { BomLineResponseDto } from '../dto/response/bom-line-response.dto';
import { BomLinesService } from '../services/bom-lines.service';

@Controller('boms/:bomId/lines')
export class BomLinesController {
  constructor(private readonly service: BomLinesService) {}

  @Get()
  list(
    @Param('bomId', new ParseUUIDPipe({ version: '4' })) bomId: string,
  ): Promise<BomLineResponseDto[]> {
    return this.service.list(bomId);
  }

  @Post()
  create(
    @Param('bomId', new ParseUUIDPipe({ version: '4' })) bomId: string,
    @Body() dto: CreateBomLineDto,
  ): Promise<BomLineResponseDto> {
    return this.service.create(bomId, dto);
  }
}
