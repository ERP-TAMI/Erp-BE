import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StageGroupsService, StageGroupResponse } from './stage-groups.service';

@ApiTags('Stage Groups')
@Controller(['masters/stage-groups', 'api/masters/stage-groups', 'api/v1/masters/stage-groups'])
export class StageGroupsController {
  constructor(private readonly service: StageGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách nhóm công đoạn từ dữ liệu nền (Master Data)' })
  @ApiResponse({ status: 200, description: 'Danh sách các nhóm công đoạn' })
  findAll(): Promise<StageGroupResponse[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết nhóm công đoạn theo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết nhóm công đoạn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy nhóm công đoạn' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StageGroupResponse> {
    return this.service.findOne(id);
  }
}
