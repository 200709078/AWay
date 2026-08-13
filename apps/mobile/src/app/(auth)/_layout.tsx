import { Redirect, Stack } from "expo-router";
import { AppScreen, LoadingView } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";

export default function AuthLayout() {
  const { session, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <AppScreen>
        <LoadingView label="Oturum kontrol ediliyor…" />
      </AppScreen>
    );
  }

  if (session) {
    return <Redirect href="/schools" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
