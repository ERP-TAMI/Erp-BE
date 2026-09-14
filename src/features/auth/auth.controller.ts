import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_DAYS,
} from './auth.constants';
import { RequestUser } from './jwt-payload.type';
import {
  CompletePasswordSetupDto,
  PasswordSetupValidationResponseDto,
  ValidatePasswordSetupDto,
} from './dto/password-setup.dto';
import { PasswordSetupService } from './password-setup.service';
import {
  CompletePasswordResetDto,
  ForgotPasswordDto,
  PasswordResetAcceptedDto,
  PasswordResetValidationResponseDto,
  ValidatePasswordResetDto,
} from './dto/password-reset.dto';
import { PasswordResetService } from './password-reset.service';
import {
  FORGOT_PASSWORD_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_LIMIT_TTL_MS,
} from './auth.constants';

type AuthenticatedRequest = Request & { user: RequestUser };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordSetupService: PasswordSetupService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: FORGOT_PASSWORD_RATE_LIMIT,
      ttl: FORGOT_PASSWORD_RATE_LIMIT_TTL_MS,
    },
  })
  @ApiAcceptedResponse({ type: PasswordResetAcceptedDto })
  @ApiTooManyRequestsResponse({
    description: 'Too many password-reset requests from this client',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<PasswordResetAcceptedDto> {
    const reset = await this.passwordResetService.request(dto.email);
    void this.passwordResetService.deliver(reset);
    return { status: 'pending' };
  }

  @Post('password-reset/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PasswordResetValidationResponseDto })
  validatePasswordReset(
    @Body() dto: ValidatePasswordResetDto,
  ): Promise<PasswordResetValidationResponseDto> {
    return this.passwordResetService.validate(dto.token);
  }

  @Post('password-reset/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Password reset successfully' })
  completePasswordReset(@Body() dto: CompletePasswordResetDto): Promise<void> {
    return this.passwordResetService.complete(dto.token, dto.password);
  }

  @Post('password-setup/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PasswordSetupValidationResponseDto })
  validatePasswordSetup(
    @Body() dto: ValidatePasswordSetupDto,
  ): Promise<PasswordSetupValidationResponseDto> {
    return this.passwordSetupService.validate(dto.token);
  }

  @Post('password-setup/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Password configured successfully' })
  completePasswordSetup(@Body() dto: CompletePasswordSetupDto): Promise<void> {
    return this.passwordSetupService.complete(dto.token, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh session is invalid' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    try {
      const result = await this.authService.refresh(rawToken, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      this.setRefreshCookie(res, result.refreshToken);
      return { accessToken: result.accessToken, user: result.user };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Session revoked (idempotent)' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.authService.logout(rawToken);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getMe(@Req() req: AuthenticatedRequest): Promise<AuthUserDto> {
    return this.authService.getMe(req.user.id);
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }
}
