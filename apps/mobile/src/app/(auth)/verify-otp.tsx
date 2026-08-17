import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import { router } from "expo-router";
import { AppScreen, Notice, PrimaryButton, uiStyles } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import { colors, maskPhone, messageForError } from "@/lib/presentation";

export default function VerifyOtpScreen() {
  const { pendingPhone, verifyOtp, cancelOtp } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const scrollCodeInputIntoView = () => {
    const input = inputRef.current;
    const scrollView = scrollRef.current;
    if (!input || !scrollView) return;
    const nativeScrollRef = scrollView.getNativeScrollRef();
    if (!nativeScrollRef) return;
    input.measureLayout(
      nativeScrollRef,
      (_x, y) => {
        scrollView.scrollTo({ y: Math.max(0, y - 90), animated: true });
      },
      () => {
        // Ölçüm başarısız olursa kaydırmayı atla; kullanıcı elle kaydırabilir.
      },
    );
  };

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
        behavior={Platform.select({ ios: "padding", android: "height", default: undefined })}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[uiStyles.content, styles.content]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={uiStyles.eyebrow}>Telefon doğrulama</Text>
            <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.title}>
              Doğrulama kodunu girin.
            </Text>
            <Text style={uiStyles.pageDescription}>
              {maskPhone(pendingPhone)} numaralı telefona 5 dakika boyunca geçerli olacak doğrulama kodu gönderilmiştir.
            </Text>
          </View>

          <View style={[uiStyles.card, styles.form]}>
            <TextInput
              ref={inputRef}
              accessibilityLabel="Tek kullanımlık doğrulama kodu"
              autoComplete="one-time-code"
              autoFocus
              editable={!isSubmitting}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={6}
              onChange={(event) => {
                if (Platform.OS === "android") scrollCodeInputIntoView();
              }}
              onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
              onFocus={(event) => {
                if (Platform.OS === "android") scrollCodeInputIntoView();
              }}
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
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, lineHeight: 34 },
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
