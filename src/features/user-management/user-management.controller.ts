import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
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
}
