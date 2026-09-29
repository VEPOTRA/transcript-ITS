export type GenderLabel = "Male" | "Female" | "Other";

const GENDER_LABEL: Record<string, GenderLabel> = {
  M: "Male",
  MALE: "Male",
  F: "Female",
  FEMALE: "Female",
  O: "Other",
  OTHER: "Other",
};

export function toGenderLabel(
  raw: string | null | undefined,
): GenderLabel | null {
  if (!raw) return null;
  const label = GENDER_LABEL[raw.trim().toUpperCase()];
  if (!label) {
    console.warn(`[toGenderLabel] unrecognised gender value: ${raw}`);
    return null;
  }
  return label;
}
