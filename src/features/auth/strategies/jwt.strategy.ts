import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/User.entity';
import { RecordStatus } from '../../../common/enums/database.enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { JwtPayload, RequestUser } from '../jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-local-env',
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    const isLocked =
      !!user?.lockoutUntil && user.lockoutUntil.getTime() > Date.now();

    if (!user || user.status !== RecordStatus.ACTIVE || isLocked) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    return {
      id: user.id,
      email: user.email,
      roleCode: payload.roleCode,
      permissions: payload.permissions,
    };
  }
}
