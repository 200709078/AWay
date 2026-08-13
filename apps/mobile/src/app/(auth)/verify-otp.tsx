import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { AppScreen, Notice, PrimaryButton, uiStyles } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import { colors, maskPhone, messageForError } from "@/lib/presentation";

export default function VerifyOtpScreen() {
  const { pendingPhone, verifyOtp, cancelOtp } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!pendingPhone) {
      router.replace("/sign-in");
    }
  }, [pendingPhone]);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await verifyOtp(code);
      router.replace("/schools");
    } catch (verifyError) {
      setError(messageForError(verifyError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!pendingPhone) {
    return null;
  }

  return (
    <AppScreen>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={[uiStyles.content, styles.content]} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={uiStyles.eyebrow}>Telefon doğrulama</Text>
            <Text style={styles.title}>6 haneli kodu girin.</Text>
            <Text style={uiStyles.pageDescription}>
              Kod {maskPhone(pendingPhone)} numarasına gönderildi. Kod 5 dakika geçerlidir.
            </Text>
          </View>

          <View style={[uiStyles.card, styles.form]}>
            <TextInput
              accessibilityLabel="Tek kullanımlık doğrulama kodu"
              autoComplete="one-time-code"
              autoFocus
              editable={!isSubmitting}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
              placeholder="••••••"
              placeholderTextColor="#7A8781"
              style={styles.codeInput}
              textContentType="oneTimeCode"
              value={code}
            />
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <PrimaryButton
              disabled={code.length !== 6}
              label="Girişi tamamla"
              loading={isSubmitting}
              onPress={() => void submit()}
            />
            <PrimaryButton
              label="Telefon numarasını değiştir"
              tone="ghost"
              onPress={() => {
                cancelOtp();
                router.replace("/sign-in");
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { justifyContent: "center" },
  hero: { gap: 10, paddingTop: 48 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 38 },
  form: { gap: 14, marginTop: 16 },
  codeInput: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 10,
    minHeight: 62,
    paddingHorizontal: 18,
    textAlign: "center",
  },
});
