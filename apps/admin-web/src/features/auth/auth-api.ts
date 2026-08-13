import { apiRequest } from "../../lib/api";

export interface SignedInUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
}

interface OtpRequestResponse {
  message: string;
  phone: string;
}

interface WebSessionResponse {
  message: string;
  user: SignedInUser;
  accessToken: string;
}

export interface AuthenticatedSession {
  user: SignedInUser;
  accessToken: string;
}

export async function requestOtp(phone: string): Promise<OtpRequestResponse> {
  return apiRequest<OtpRequestResponse>("/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

export async function verifyWebOtp(
  phone: string,
  code: string,
): Promise<AuthenticatedSession> {
  const response = await apiRequest<WebSessionResponse>(
    "/auth/web/verify-otp",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    },
  );

  return {
    user: response.user,
    accessToken: response.accessToken,
  };
}

export async function refreshWebSession(): Promise<AuthenticatedSession> {
  const response = await apiRequest<WebSessionResponse>("/auth/web/refresh", {
    method: "POST",
  });

  return {
    user: response.user,
    accessToken: response.accessToken,
  };
}

export async function logoutWebSession(): Promise<void> {
  await apiRequest<{ message: string }>("/auth/web/logout", {
    method: "POST",
  });
}
