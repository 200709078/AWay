import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { ApiError, apiRequest } from "@/lib/api";
import type {
  AuthenticatedRequest,
  AuthenticatedSession,
  MembershipRole,
  MobileAuthSession,
  SchoolContext,
} from "@/lib/types";
import {
  logoutMobileSession,
  refreshMobileSession,
  requestOtp as requestOtpFromApi,
  verifyOtp as verifyOtpFromApi,
} from "./auth-api";
import { AuthContext, type SelectedSchool } from "./auth-context";

const REFRESH_TOKEN_KEY = "away.mobile.refresh-token.v1";

class SessionTransitionError extends Error {
  constructor() {
    super("Oturum durumu değişti. Lütfen tekrar deneyin.");
    this.name = "SessionTransitionError";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SelectedSchool | null>(null);
  const sessionRef = useRef<AuthenticatedSession | null>(null);
  const refreshInFlightRef = useRef<Promise<AuthenticatedSession> | null>(null);
  const sessionGenerationRef = useRef(0);
  const isSigningOutRef = useRef(false);
  const secureStoreQueueRef = useRef<Promise<void>>(Promise.resolve());

  const setCurrentSession = useCallback((nextSession: AuthenticatedSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const enqueueSecureStoreOperation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const nextOperation = secureStoreQueueRef.current.then(operation, operation);

      secureStoreQueueRef.current = nextOperation.then(
        () => undefined,
        () => undefined,
      );

      return nextOperation;
    },
    [],
  );

  const readRefreshToken = useCallback(
    () => enqueueSecureStoreOperation(() => SecureStore.getItemAsync(REFRESH_TOKEN_KEY)),
    [enqueueSecureStoreOperation],
  );

  const invalidateSessionState = useCallback(() => {
    sessionGenerationRef.current += 1;
    refreshInFlightRef.current = null;
    setCurrentSession(null);
    setPendingPhone(null);
    setSelectedSchool(null);
    setRestoreError(null);
  }, [setCurrentSession]);

  const clearSession = useCallback(async () => {
    invalidateSessionState();
    await enqueueSecureStoreOperation(() =>
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ).catch(() => undefined);
  }, [enqueueSecureStoreOperation, invalidateSessionState]);

  const persistSession = useCallback(
    async (
      nextSession: MobileAuthSession,
      resetSchoolSelection: boolean,
      expectedGeneration: number,
    ): Promise<AuthenticatedSession> => {
      if (expectedGeneration !== sessionGenerationRef.current) {
        throw new SessionTransitionError();
      }

      try {
        await enqueueSecureStoreOperation(() => {
          if (expectedGeneration !== sessionGenerationRef.current) {
            throw new SessionTransitionError();
          }

          return SecureStore.setItemAsync(
            REFRESH_TOKEN_KEY,
            nextSession.refreshToken,
            {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            },
          );
        });
      } catch (error) {
        if (error instanceof SessionTransitionError) {
          throw error;
        }

        await clearSession();
        throw new Error(
          "Güvenli cihaz depolamasına yazılamadı. Lütfen tekrar deneyin.",
        );
      }

      if (expectedGeneration !== sessionGenerationRef.current) {
        throw new SessionTransitionError();
      }

      const authenticatedSession: AuthenticatedSession = {
        accessToken: nextSession.accessToken,
        user: nextSession.user,
      };

      setCurrentSession(authenticatedSession);
      setRestoreError(null);

      if (resetSchoolSelection) {
        setSelectedSchool(null);
      }

      return authenticatedSession;
    },
    [clearSession, enqueueSecureStoreOperation, setCurrentSession],
  );

  const refreshSession = useCallback(async (allowWithoutSession = false): Promise<AuthenticatedSession> => {
    if (isSigningOutRef.current) {
      throw new SessionTransitionError();
    }

    if (!allowWithoutSession && !sessionRef.current) {
      throw new SessionTransitionError();
    }

    if (!refreshInFlightRef.current) {
      const expectedGeneration = sessionGenerationRef.current;
      const refreshPromise = (async () => {
        const refreshToken = await readRefreshToken();

        if (expectedGeneration !== sessionGenerationRef.current) {
          throw new SessionTransitionError();
        }

        if (!refreshToken) {
          throw new ApiError(401, "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");
        }

        const nextSession = await refreshMobileSession(refreshToken);
        return persistSession(nextSession, false, expectedGeneration);
      })();

      refreshInFlightRef.current = refreshPromise;
      refreshPromise.then(
        () => {
          if (refreshInFlightRef.current === refreshPromise) {
            refreshInFlightRef.current = null;
          }
        },
        () => {
          if (refreshInFlightRef.current === refreshPromise) {
            refreshInFlightRef.current = null;
          }
        },
      );
    }

    return refreshInFlightRef.current;
  }, [persistSession, readRefreshToken]);

  const restoreSession = useCallback(async () => {
    setIsRestoring(true);
    setRestoreError(null);

    try {
      const refreshToken = await readRefreshToken();

      if (!refreshToken) {
        setCurrentSession(null);
        return;
      }

      await refreshSession(true);
    } catch (error) {
      if (error instanceof SessionTransitionError) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        return;
      }

      setCurrentSession(null);
      setRestoreError(
        error instanceof Error
          ? error.message
          : "Oturum geri yüklenemedi. Lütfen tekrar deneyin.",
      );
    } finally {
      setIsRestoring(false);
    }
  }, [clearSession, readRefreshToken, refreshSession, setCurrentSession]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const request = useCallback<AuthenticatedRequest>(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      if (isSigningOutRef.current) {
        throw new SessionTransitionError();
      }

      const currentSession = sessionRef.current;

      if (!currentSession) {
        throw new ApiError(401, "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");
      }

      try {
        return await requestWithAccessToken<T>(currentSession.accessToken, path, options);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
      }

      let refreshedSession: AuthenticatedSession;

      try {
        refreshedSession = await refreshSession();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearSession();
        }

        throw error;
      }

      try {
        return await requestWithAccessToken<T>(refreshedSession.accessToken, path, options);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearSession();
        }

        throw error;
      }
    },
    [clearSession, refreshSession],
  );

  const requestOtp = useCallback(async (phone: string) => {
    const result = await requestOtpFromApi(phone);
    setPendingPhone(result.phone);
  }, []);

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!pendingPhone) {
        throw new ApiError(400, "Telefon numaranızı yeniden girin.");
      }

      const nextSession = await verifyOtpFromApi(pendingPhone, code);
      const expectedGeneration = sessionGenerationRef.current + 1;
      sessionGenerationRef.current = expectedGeneration;
      refreshInFlightRef.current = null;
      await persistSession(nextSession, true, expectedGeneration);
      setPendingPhone(null);
    },
    [pendingPhone, persistSession],
  );

  const cancelOtp = useCallback(() => {
    setPendingPhone(null);
  }, []);

  const selectSchool = useCallback(
    (context: SchoolContext, selectedRole: MembershipRole) => {
      if (!context.roles.includes(selectedRole)) {
        throw new Error("Seçilen rol için aktif okul üyeliği bulunamadı.");
      }

      setSelectedSchool({
        school: context.school,
        roles: context.roles,
        selectedRole,
      });
    },
    [],
  );

  const clearSelectedSchool = useCallback(() => {
    setSelectedSchool(null);
  }, []);

  const signOut = useCallback(async () => {
    if (isSigningOutRef.current) {
      return;
    }

    isSigningOutRef.current = true;

    try {
      const activeRefresh = refreshInFlightRef.current;

      if (activeRefresh) {
        await activeRefresh.catch(() => undefined);
      }

      const refreshToken = await readRefreshToken().catch(() => null);

      if (refreshToken) {
        await logoutMobileSession(refreshToken);
      }
    } catch {
      // Uzak oturum zaten geçersiz olabilir; yerel güvenli depolama yine temizlenir.
    } finally {
      await clearSession();
      isSigningOutRef.current = false;
    }
  }, [clearSession, readRefreshToken]);

  const value = useMemo(
    () => ({
      session,
      isRestoring,
      restoreError,
      pendingPhone,
      selectedSchool,
      requestOtp,
      verifyOtp,
      cancelOtp,
      request,
      selectSchool,
      clearSelectedSchool,
      retryRestore: restoreSession,
      discardStoredSession: clearSession,
      signOut,
    }),
    [
      cancelOtp,
      clearSelectedSchool,
      clearSession,
      isRestoring,
      pendingPhone,
      request,
      requestOtp,
      restoreError,
      restoreSession,
      selectedSchool,
      session,
      signOut,
      verifyOtp,
      selectSchool,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function requestWithAccessToken<T>(
  accessToken: string,
  path: string,
  options: RequestInit,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return apiRequest<T>(path, {
    ...options,
    headers,
  });
}
