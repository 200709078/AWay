import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { AppScreen, Notice, PrimaryButton, uiStyles } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import { colors, messageForError } from "@/lib/presentation";

export default function SignInScreen() {
  const { requestOtp } = useAuth();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await requestOtp(phone);
      router.push("/verify-otp");
    } catch (requestError) {
      setError(messageForError(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppScreen>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={[uiStyles.content, styles.content]} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={uiStyles.eyebrow}>AWay</Text>
            <Text style={styles.title}>Yoklamaya güvenle bağlanın.</Text>
            <Text style={uiStyles.pageDescription}>
              Telefon numaranıza gönderilen tek kullanımlık kodla giriş yapın.
            </Text>
          </View>

          <View style={[uiStyles.card, styles.form]}>
            <Text style={uiStyles.sectionTitle}>Telefon numarası</Text>
            <Text style={uiStyles.muted}>
              Türkiye numaranızı 05xx xxx xx xx veya +90 biçiminde yazabilirsiniz.
            </Text>
            <TextInput
              accessibilityLabel="Telefon numarası"
              autoComplete="tel"
              autoFocus
              editable={!isSubmitting}
              inputMode="tel"
              keyboardType="phone-pad"
              onBlur={() => {
                if (phone === "05") setPhone("");
              }}
              onChangeText={setPhone}
              onFocus={() => {
                if (!phone) setPhone("05");
              }}
              placeholder="05xxxxxxxxx"
              placeholderTextColor="#7A8781"
              style={styles.input}
              textContentType="telephoneNumber"
              value={phone}
            />
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <PrimaryButton
              disabled={!phone.trim()}
              label="Kod gönder"
              loading={isSubmitting}
              onPress={() => void submit()}
            />
          </View>

          <Notice tone="information">
            İlk girişiniz, okul yöneticiniz tarafından önceden tanımlanmış telefon numarasıyla eşleşir.
          </Notice>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { justifyContent: "center" },
  hero: { gap: 10, paddingTop: 48 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "800", letterSpacing: -1, lineHeight: 40 },
  form: { gap: 14, marginTop: 16 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14,
  },
});
