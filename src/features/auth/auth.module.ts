import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AUTH_ENTITIES } from './entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DEFAULT_ACCESS_TOKEN_EXPIRY } from './auth.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature(AUTH_ENTITIES),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'change-me-in-local-env',
        signOptions: {
          expiresIn: (process.env.JWT_EXPIRY ??
            DEFAULT_ACCESS_TOKEN_EXPIRY) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
