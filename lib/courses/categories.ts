export const COURSE_CATEGORIES = [
  "OSIS_OLD",
  "OSIS_ONE",
  "OSIS_ITC",
  "OSIS_SRO",
  "OSIS_MAIN",
  "OSIS_EVAL",
  "OSIS_NEW",
  "ITS",
  "OSIS_2",
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  OSIS_OLD: "OSIS Old",
  OSIS_ONE: "OSIS One",
  OSIS_ITC: "OSIS ITC",
  OSIS_SRO: "OSIS SRO",
  OSIS_MAIN: "OSIS Main",
  OSIS_EVAL: "OSIS Evaluation",
  OSIS_NEW: "OSIS New",
  ITS: "ITS",
  OSIS_2: "OSIS 2",
};
