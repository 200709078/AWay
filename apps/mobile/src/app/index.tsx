import { Redirect } from "expo-router";
import { View } from "react-native";
import { AppScreen, EmptyState, LoadingView, PrimaryButton } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";

export default function IndexScreen() {
  const {
    session,
    isRestoring,
    restoreError,
    retryRestore,
    discardStoredSession,
  } = useAuth();

  if (isRestoring) {
    return (
      <AppScreen>
        <LoadingView label="Güvenli oturum kontrol ediliyor…" />
      </AppScreen>
    );
  }

  if (restoreError) {
    return (
      <AppScreen>
        <View style={{ flex: 1, justifyContent: "center", padding: 20 }}>
          <EmptyState
            title="Oturum geri yüklenemedi"
            detail={restoreError}
            action={
              <>
                <PrimaryButton label="Tekrar dene" onPress={() => void retryRestore()} />
                <View style={{ height: 8 }} />
                <PrimaryButton
                  label="Girişe dön"
                  tone="ghost"
                  onPress={() => void discardStoredSession()}
                />
              </>
            }
          />
        </View>
      </AppScreen>
    );
  }

  return <Redirect href={session ? "/schools" : "/sign-in"} />;
}
