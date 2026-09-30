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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import {
  StyleSampleRoundsService,
  StyleSampleRoundItem,
  StyleSampleImageItem,
  PresignStyleSampleImageResult,
  StyleSampleImageDownloadUrlResult,
} from './style-sample-rounds.service';
import {
  CreateStyleSampleRoundDto,
  UpdateStyleSampleRoundDto,
  PresignStyleSampleImageDto,
  ConfirmStyleSampleImageDto,
} from './dto/style-sample-round.dto';

const VIEW_PERMISSION = 'master_data.styles.view';
const MANAGE_PERMISSION = 'master_data.styles.manage';

@ApiTags('style-sample-rounds')
@ApiBearerAuth()
@Auth(VIEW_PERMISSION)
@Controller('styles/:styleId/sample-rounds')
export class StyleSampleRoundsController {
  constructor(private readonly service: StyleSampleRoundsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách lần may mẫu của mẫu Fit' })
  async list(
    @Param('styleId', ParseUUIDPipe) styleId: string,
  ): Promise<StyleSampleRoundItem[]> {
    return this.service.list(styleId);
  }

  @Post()
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo lần may mẫu mới cho mẫu Fit' })
  async create(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: CreateStyleSampleRoundDto,
    @Req() req?: any,
  ): Promise<StyleSampleRoundItem> {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.create(styleId, dto, userId, actor);
  }

  @Patch(':roundId')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Sửa thông tin lần may mẫu' })
  async update(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: UpdateStyleSampleRoundDto,
    @Req() req?: any,
  ): Promise<StyleSampleRoundItem> {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.update(styleId, roundId, dto, userId, actor);
  }

  @Post(':roundId/images/presign')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Xin presigned URL để upload ảnh lần may mẫu' })
  async presignImage(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: PresignStyleSampleImageDto,
  ): Promise<PresignStyleSampleImageResult> {
    return this.service.presignImage(styleId, roundId, dto);
  }

  @Post(':roundId/images/confirm')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Xác nhận đã upload xong, ghi ảnh vào lần may mẫu' })
  async confirmImage(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: ConfirmStyleSampleImageDto,
    @Req() req?: any,
  ): Promise<StyleSampleImageItem> {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.confirmImage(styleId, roundId, userId, dto, actor);
  }

  @Get(':roundId/images/:imageId/download-url')
  @ApiOperation({ summary: 'Lấy URL tải ảnh lần may mẫu về máy' })
  async getImageDownloadUrl(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<StyleSampleImageDownloadUrlResult> {
    return this.service.getImageDownloadUrl(styleId, roundId, imageId);
  }

  @Delete(':roundId/images/:imageId')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá ảnh khỏi lần may mẫu' })
  async removeImage(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Req() req?: any,
  ): Promise<void> {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.removeImage(styleId, roundId, imageId, actor);
  }
}
