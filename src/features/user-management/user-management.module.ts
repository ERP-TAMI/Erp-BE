import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/User.entity';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule {}
