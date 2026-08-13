import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../lib/api";
import {
  logoutWebSession,
  refreshWebSession,
  type AuthenticatedSession,
} from "./auth-api";
import {
  AuthContext,
  type AuthenticatedRequest,
  type AuthContextValue,
} from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const sessionRef = useRef<AuthenticatedSession | null>(null);
  const refreshInFlightRef = useRef<Promise<AuthenticatedSession> | null>(null);

  const setCurrentSession = useCallback(
    (nextSession: AuthenticatedSession | null) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
    },
    [],
  );

  const clearSession = useCallback(() => {
    setCurrentSession(null);
    queryClient.clear();
  }, [queryClient, setCurrentSession]);

  const refreshSession =
    useCallback(async (): Promise<AuthenticatedSession> => {
      if (!refreshInFlightRef.current) {
        refreshInFlightRef.current = refreshWebSession()
          .then((nextSession) => {
            setCurrentSession(nextSession);
            return nextSession;
          })
          .finally(() => {
            refreshInFlightRef.current = null;
          });
      }

      return refreshInFlightRef.current;
    }, [setCurrentSession]);

  useEffect(() => {
    let active = true;

    void refreshSession()
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error("Web oturumu geri yüklenemedi.", error);
        }
      })
      .finally(() => {
        if (active) {
          setIsRestoring(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshSession]);

  const request = useCallback<AuthenticatedRequest>(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const currentSession = sessionRef.current;

      if (!currentSession) {
        throw new ApiError(
          401,
          "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.",
        );
      }

      try {
        return await requestWithAccessToken<T>(
          currentSession.accessToken,
          path,
          options,
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
      }

      let refreshedSession: AuthenticatedSession;

      try {
        refreshedSession = await refreshSession();
      } catch (error) {
        clearSession();
        throw error;
      }

      try {
        return await requestWithAccessToken<T>(
          refreshedSession.accessToken,
          path,
          options,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
        }

        throw error;
      }
    },
    [clearSession, refreshSession],
  );

  const startSession = useCallback(
    (nextSession: AuthenticatedSession) => {
      setCurrentSession(nextSession);
    },
    [setCurrentSession],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutWebSession();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: session?.accessToken ?? null,
      user: session?.user ?? null,
      isRestoring,
      request,
      startSession,
      signOut,
    }),
    [isRestoring, request, session, signOut, startSession],
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
