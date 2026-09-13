import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/User.entity';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule {}
