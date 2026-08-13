import { apiRequest } from "@/lib/api";
import type { MobileAuthSession } from "@/lib/types";

interface RequestOtpResponse {
  message: string;
  phone: string;
}

export function requestOtp(phone: string): Promise<RequestOtpResponse> {
  return apiRequest<RequestOtpResponse>("/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(phone: string, code: string): Promise<MobileAuthSession> {
  return apiRequest<MobileAuthSession>("/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
}

export function refreshMobileSession(refreshToken: string): Promise<MobileAuthSession> {
  return apiRequest<MobileAuthSession>("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}

export function logoutMobileSession(refreshToken: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}
