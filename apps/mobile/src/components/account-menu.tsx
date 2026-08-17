import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/features/auth/auth-context";
import { colors, roleLabel } from "@/lib/presentation";

export function AccountMenu() {
  const { session, selectedSchool, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!session) {
    return null;
  }

  const user = session.user;
  const initials = `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`;

  const handleSignOut = async () => {
    setOpen(false);
    setIsSigningOut(true);

    try {
      await signOut();
      router.replace("/sign-in");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSwitchSchool = () => {
    setOpen(false);
    router.replace("/schools");
  };

  const hasSchool = Boolean(selectedSchool);
  const school = selectedSchool?.school;

  return (
    <View>
      <Pressable
        accessibilityLabel={`${user.firstName} ${user.lastName}, hesap sahibi menüsü`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.avatar,
          pressed ? styles.avatarPressed : null,
        ]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Menüyü kapat"
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              {hasSchool ? (
                <>
                  <Text style={styles.panelSchool}>{school!.name}</Text>
                  <Text style={styles.panelSmall}>
                    {school!.code} · {roleLabel(selectedSchool!.selectedRole)}
                  </Text>
                  <Text style={styles.panelUser}>
                    {user.firstName} {user.lastName}
                  </Text>
                </>
              ) : (
                <Text style={styles.panelUser}>
                  {user.firstName} {user.lastName}
                </Text>
              )}
            </View>

            <Pressable disabled style={styles.menuItem}>
              <Text style={styles.menuItemText}>Profil Ayarları</Text>
              <Text style={styles.menuItemSoon}>Yakında</Text>
            </Pressable>

            {hasSchool ? (
              <Pressable
                disabled={isSigningOut}
                onPress={handleSwitchSchool}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed ? styles.menuItemPressed : null,
                ]}
              >
                <Text style={styles.menuItemText}>Okul Değiştir</Text>
              </Pressable>
            ) : null}

            <Pressable
              disabled={isSigningOut}
              onPress={() => void handleSignOut()}
              style={({ pressed }) => [
                styles.menuItem,
                pressed ? styles.menuItemPressed : null,
              ]}
            >
              <Text style={styles.menuItemLogout}>
                {isSigningOut ? "Çıkılıyor…" : "Çıkış"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: "#DCEEE2",
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarPressed: { backgroundColor: "#C7E0D2" },
  avatarText: { color: colors.brandDark, fontSize: 14, fontWeight: "800" },
  modalRoot: { flex: 1 },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 8,
    marginRight: 16,
    marginTop: 6,
    minWidth: 250,
    padding: 6,
    shadowColor: "#000000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  panelHeader: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 2, padding: 12 },
  panelSchool: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  panelSmall: { color: colors.muted, fontSize: 12 },
  panelUser: { color: colors.ink, fontSize: 13, fontWeight: "600", marginTop: 2 },
  menuItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  menuItemPressed: { backgroundColor: "#EEF4F0" },
  menuItemText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  menuItemSoon: { color: colors.muted, fontSize: 12 },
  menuItemLogout: { color: colors.danger, fontSize: 15, fontWeight: "700" },
});