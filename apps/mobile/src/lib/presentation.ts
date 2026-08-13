import type { MembershipRole } from "./types";

export const colors = {
  canvas: "#F5F7F4",
  surface: "#FFFFFF",
  ink: "#142522",
  muted: "#63716C",
  brand: "#176457",
  brandDark: "#0F3633",
  border: "#CFD9D2",
  success: "#27623F",
  successSoft: "#E5F3E7",
  warning: "#875D14",
  warningSoft: "#FFF2D6",
  danger: "#954034",
  dangerSoft: "#F9E8E4",
  information: "#1B5E78",
  informationSoft: "#E4F3F8",
} as const;

export function roleLabel(role: MembershipRole): string {
  const labels: Record<MembershipRole, string> = {
    ADMIN: "Yönetici",
    TEACHER: "Öğretmen",
    PARENT: "Veli",
    STUDENT: "Öğrenci",
  };

  return labels[role];
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) {
    return "••••";
  }

  return `${phone.slice(0, 3)} ••• •• ${phone.slice(-2)}`;
}

export function messageForError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
