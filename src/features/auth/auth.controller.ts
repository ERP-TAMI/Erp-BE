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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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

type AuthenticatedRequest = Request & { user: RequestUser };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
