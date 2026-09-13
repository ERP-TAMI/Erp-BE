import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Auth } from '../../common/decorators/auth.decorator';
import { RequestUser } from '../auth/jwt-payload.type';
import {
  CreateUserResponseDto,
  InvitationResponseDto,
  MutateUserDto,
  UpdateUserResponseDto,
} from './dto/mutate-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';
import { UserManagementService } from './user-management.service';

@ApiTags('User Management')
@ApiBearerAuth()
@Auth('system.users.manage')
@Controller('system/users')
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  @Get()
  @ApiOkResponse({ type: UserListResponseDto })
  findAll(@Query() query: QueryUsersDto): Promise<UserListResponseDto> {
    return this.userManagementService.findAll(query);
  }

  @Post()
  @ApiCreatedResponse({ type: CreateUserResponseDto })
  create(
    @Body() dto: MutateUserDto,
    @Req() req: Request & { user: RequestUser },
  ): Promise<CreateUserResponseDto> {
    return this.userManagementService.create(dto, req.user);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UpdateUserResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MutateUserDto,
    @Req() req: Request & { user: RequestUser },
  ): Promise<UpdateUserResponseDto> {
    return this.userManagementService.update(id, dto, req.user);
  }

  @Post(':id/password-setup-email')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InvitationResponseDto })
  resendPasswordSetup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: RequestUser },
  ): Promise<InvitationResponseDto> {
    return this.userManagementService.resendPasswordSetup(id, req.user);
  }
}
