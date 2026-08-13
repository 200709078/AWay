import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  clearWebRefreshCookie,
  readWebRefreshCookie,
  setWebRefreshCookie,
} from './web-refresh-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.phone);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.code);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('web/verify-otp')
  async webVerifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyOtp(dto.phone, dto.code);
    setWebRefreshCookie(response, result.refreshToken);

    return {
      message: result.message,
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('web/refresh')
  async webRefresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      readWebRefreshCookie(cookieHeader) ?? '',
    );
    setWebRefreshCookie(response, result.refreshToken);

    return {
      message: result.message,
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('web/logout')
  async webLogout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.authService.logout(
        readWebRefreshCookie(cookieHeader) ?? '',
      );
    } finally {
      clearWebRefreshCookie(response);
    }
  }
}
