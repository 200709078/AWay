import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppScreen, EmptyState, LoadingView, Notice, Pill, PrimaryButton, uiStyles } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import { getMySchools, getSchoolContext } from "@/features/schools/schools-api";
import type { MembershipRole, SchoolSummary } from "@/lib/types";
import { colors, messageForError, roleLabel } from "@/lib/presentation";

const ATTENDANCE_ROLES: MembershipRole[] = ["ADMIN", "TEACHER"];

export default function SchoolsScreen() {
  const { request, session, selectSchool, selectedSchool, signOut } = useAuth();
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadSchools = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setSchools(await getMySchools(request));
    } catch (loadError) {
      setError(messageForError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const activate = async (school: SchoolSummary, role: MembershipRole) => {
    const key = `${school.id}:${role}`;
    setActivating(key);
    setSelectionMessage(null);
    setError(null);

    try {
      const context = await getSchoolContext(request, school.id);
      selectSchool(context, role);

      if (ATTENDANCE_ROLES.includes(role)) {
        router.replace("/attendance");
        return;
      }

      setSelectionMessage(
        `${school.name} okulunda ${roleLabel(role)} rolüyle giriş yaptınız. Bu ilk mobil dilimde yoklama alma yalnız yönetici ve öğretmen rollerine açıktır.`,
      );
    } catch (activationError) {
      setError(messageForError(activationError));
      void loadSchools();
    } finally {
      setActivating(null);
    }
  };

  const logout = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
      router.replace("/sign-in");
    } finally {
      setIsSigningOut(false);
    }
  };

  if (isLoading && !schools) {
    return (
      <AppScreen>
        <LoadingView label="Okullarınız yükleniyor…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={uiStyles.eyebrow}>AWay</Text>
            <Text style={uiStyles.pageTitle}>Okul ve rol seçin</Text>
            <Text style={uiStyles.pageDescription}>
              {session ? `${session.user.firstName} ${session.user.lastName} olarak giriş yaptınız.` : ""}
            </Text>
          </View>
          <PrimaryButton label="Çıkış" tone="ghost" loading={isSigningOut} onPress={() => void logout()} />
        </View>

        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}
        {selectionMessage ? <Notice tone="information">{selectionMessage}</Notice> : null}

        {schools?.length ? (
          schools.map((school) => (
            <View key={school.id} style={[uiStyles.card, styles.schoolCard]}>
              <View style={styles.schoolHeading}>
                <View style={styles.schoolCopy}>
                  <Text style={styles.schoolName}>{school.name}</Text>
                  <Text style={uiStyles.muted}>{school.code}</Text>
                </View>
                {selectedSchool?.school.id === school.id ? <Pill label="Seçili" tone="brand" /> : null}
              </View>

              <Text style={styles.rolePrompt}>Devam etmek istediğiniz rolü seçin.</Text>
              <View style={styles.roleButtons}>
                {school.roles.map((role) => (
                  <PrimaryButton
                    disabled={activating !== null}
                    key={role}
                    label={roleLabel(role)}
                    loading={activating === `${school.id}:${role}`}
                    onPress={() => void activate(school, role)}
                    tone={ATTENDANCE_ROLES.includes(role) ? "primary" : "secondary"}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            title="Aktif okul erişiminiz yok"
            detail="Okul yöneticiniz telefon numaranızla erişim tanımladığında burada görünecektir."
            action={<PrimaryButton label="Yenile" tone="secondary" onPress={() => void loadSchools()} />}
          />
        )}

        {schools?.length ? (
          <PrimaryButton label="Listeyi yenile" tone="secondary" onPress={() => void loadSchools()} />
        ) : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  headerCopy: { flex: 1, gap: 6 },
  schoolCard: { gap: 14 },
  schoolHeading: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  schoolCopy: { flex: 1, gap: 3 },
  schoolName: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  rolePrompt: { color: colors.muted, fontSize: 14 },
  roleButtons: { gap: 8 },
});
