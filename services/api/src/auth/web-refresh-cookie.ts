import type { CookieOptions, Response } from 'express';
import ms from 'ms';

export const WEB_REFRESH_COOKIE_NAME = 'away_web_refresh';

export function setWebRefreshCookie(
  response: Response,
  refreshToken: string,
): void {
  response.cookie(WEB_REFRESH_COOKIE_NAME, refreshToken, {
    ...webRefreshCookieOptions(),
    maxAge: refreshCookieMaxAge(),
  });
}

export function clearWebRefreshCookie(response: Response): void {
  response.clearCookie(WEB_REFRESH_COOKIE_NAME, webRefreshCookieOptions());
}

export function readWebRefreshCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${WEB_REFRESH_COOKIE_NAME}=`;

  for (const cookie of cookieHeader.split(';')) {
    const value = cookie.trim();

    if (!value.startsWith(prefix)) {
      continue;
    }

    try {
      return decodeURIComponent(value.slice(prefix.length));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function webRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/web',
  };
}

function refreshCookieMaxAge(): number {
  const configuredDuration = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';
  const duration = ms(configuredDuration as ms.StringValue);

  if (typeof duration !== 'number' || duration <= 0) {
    throw new Error('JWT_REFRESH_EXPIRES_IN geçersiz.');
  }

  return duration;
}
