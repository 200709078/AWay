import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/text";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/lib/presentation";

export function AppScreen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${tone}`],
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === "primary" || tone === "danger" ? "#FFFFFF" : colors.brand} />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${tone}`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Notice({
  children,
  tone = "information",
}: {
  children: ReactNode;
  tone?: "information" | "success" | "warning" | "danger";
}) {
  return (
    <View style={[styles.notice, styles[`notice_${tone}`]]} accessibilityRole="alert">
      <Text style={[styles.noticeText, styles[`noticeText_${tone}`]]}>{children}</Text>
    </View>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function LoadingView({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const layoutStyles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 16,
    padding: 20,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
});

const typographyStyles = StyleSheet.create({
  eyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageDescription: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: "700",
  },
});

export const uiStyles = {
  ...layoutStyles,
  ...typographyStyles,
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  button_primary: { backgroundColor: colors.brand },
  button_secondary: { backgroundColor: colors.surface, borderColor: colors.brand, borderWidth: 1 },
  button_danger: { backgroundColor: colors.danger },
  button_ghost: { backgroundColor: "transparent" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { fontSize: 15, fontWeight: "700" },
  buttonText_primary: { color: "#FFFFFF" },
  buttonText_secondary: { color: colors.brand },
  buttonText_danger: { color: "#FFFFFF" },
  buttonText_ghost: { color: colors.brand },
  notice: { borderRadius: 12, padding: 12 },
  notice_information: { backgroundColor: colors.informationSoft },
  notice_success: { backgroundColor: colors.successSoft },
  notice_warning: { backgroundColor: colors.warningSoft },
  notice_danger: { backgroundColor: colors.dangerSoft },
  noticeText: { fontSize: 14, lineHeight: 20 },
  noticeText_information: { color: colors.information },
  noticeText_success: { color: colors.success },
  noticeText_warning: { color: colors.warning },
  noticeText_danger: { color: colors.danger },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pill_neutral: { backgroundColor: "#E9EEEA" },
  pill_success: { backgroundColor: colors.successSoft },
  pill_warning: { backgroundColor: colors.warningSoft },
  pill_danger: { backgroundColor: colors.dangerSoft },
  pill_brand: { backgroundColor: "#DDEEEB" },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillText_neutral: { color: colors.muted },
  pillText_success: { color: colors.success },
  pillText_warning: { color: colors.warning },
  pillText_danger: { color: colors.danger },
  pillText_brand: { color: colors.brandDark },
  centered: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 28 },
  loadingText: { color: colors.muted, fontSize: 15 },
  emptyState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 8, padding: 24 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyDetail: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  emptyAction: { alignSelf: "stretch", marginTop: 8 },
});
