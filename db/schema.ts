import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  uniqueIndex,
  index,
  pgEnum,
  jsonb,
  bigint,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const importRunStatusEnum = pgEnum("import_run_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const importChunkStatusEnum = pgEnum("import_chunk_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export const importRowStatusEnum = pgEnum("import_row_status", [
  "IMPORTED",
  "REJECTED",
  "DUPLICATE",
]);

export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "ADMIN", "VIEWER"]);
export const semesterEnum = pgEnum("semester", ["FIRST", "SECOND"]);
export const studentStatusEnum = pgEnum("student_status", [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "GRADUATED",
  "WITHDRAWN",
]);
export const studentTypeEnum = pgEnum("student_type", [
  "UNDERGRADUATE",
  "POSTGRADUATE",
]);
export const programmeTypeEnum = pgEnum("programme_type", [
  "DEGREE",
  "DIPLOMA",
  "CERTIFICATE",
  "POST_DIPLOMA",
  "GRADUATE_MASTER",
  "GRAD_MASTERS",
  "GRAD_DIPLOMA",
  "GRAD_RESEARCH",
  "GRADUATE_DOCTOR",
]);
export const gradeEnum = pgEnum("grade", [
  "A",
  "B+",
  "B",
  "C+",
  "C",
  "D+",
  "D",
  "E",
  "F",
  "X",
  "IC",
  "P",
]);
export const transcriptStatusEnum = pgEnum("transcript_status", [
  "PENDING",
  "GENERATING",
  "COMPLETED",
  "FAILED",
]);
export const uploadJobStatusEnum = pgEnum("upload_job_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const courseCategoryEnum = pgEnum("course_category", [
  "OSIS_OLD",
  "OSIS_ONE",
  "OSIS_ITC",
  "OSIS_SRO",
  "OSIS_MAIN",
  "OSIS_EVAL",
  "OSIS_NEW",
  "ITS",
  "OSIS_2",
]);

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importType: varchar("import_type", { length: 50 })
      .notNull()
      .default("RESULTS"),
    sourceFile: varchar("source_file", { length: 500 }).notNull(),
    totalRecords: bigint("total_records", {
      mode: "number",
    }),
    processedRecords: bigint("processed_records", {
      mode: "number",
    })
      .notNull()
      .default(0),
    importedRecords: bigint("imported_records", {
      mode: "number",
    })
      .notNull()
      .default(0),
    rejectedRecords: bigint("rejected_records", {
      mode: "number",
    })
      .notNull()
      .default(0),
    duplicateRecords: bigint("duplicate_records", {
      mode: "number",
    })
      .notNull()
      .default(0),
    status: importRunStatusEnum("status").notNull().default("PENDING"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("import_runs_status_idx").on(t.status),
    index("import_runs_type_idx").on(t.importType),
  ],
);

export const importChunks = pgTable(
  "import_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => importRuns.id, {
        onDelete: "cascade",
      }),
    partNumber: integer("part_number").notNull(),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    totalRows: bigint("total_rows", {
      mode: "number",
    }).notNull(),
    lastProcessedRow: bigint("last_processed_row", {
      mode: "number",
    })
      .notNull()
      .default(0),
    processedRows: bigint("processed_rows", {
      mode: "number",
    })
      .notNull()
      .default(0),
    importedRows: bigint("imported_rows", {
      mode: "number",
    })
      .notNull()
      .default(0),
    rejectedRows: bigint("rejected_rows", {
      mode: "number",
    })
      .notNull()
      .default(0),
    duplicateRows: bigint("duplicate_rows", {
      mode: "number",
    })
      .notNull()
      .default(0),
    status: importChunkStatusEnum("status").notNull().default("PENDING"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("import_chunks_run_idx").on(t.runId),
    uniqueIndex("import_chunks_run_part_unique").on(t.runId, t.partNumber),
  ],
);

export const importErrors = pgTable(
  "import_errors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => importRuns.id, {
        onDelete: "cascade",
      }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => importChunks.id, {
        onDelete: "cascade",
      }),
    partNumber: integer("part_number").notNull(),
    sourceRowNumber: bigint("source_row_number", {
      mode: "number",
    }).notNull(),
    studid: varchar("studid", { length: 100 }),
    courseid: varchar("courseid", { length: 100 }),
    session: varchar("session", { length: 50 }),
    errorType: varchar("error_type", { length: 100 }).notNull(),
    errorMessage: text("error_message").notNull(),
    rawData: jsonb("raw_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("import_errors_run_idx").on(t.runId),
    index("import_errors_chunk_idx").on(t.chunkId),
    index("import_errors_type_idx").on(t.errorType),
    index("import_errors_student_idx").on(t.studid),
    index("import_errors_course_idx").on(t.courseid),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => importRuns.id, {
        onDelete: "cascade",
      }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => importChunks.id, {
        onDelete: "cascade",
      }),
    partNumber: integer("part_number").notNull(),
    sourceRowNumber: bigint("source_row_number", {
      mode: "number",
    }).notNull(),
    sourceKey: varchar("source_key", {
      length: 200,
    }).notNull(),
    status: importRowStatusEnum("status").notNull(),
    gradeId: uuid("grade_id").references(() => grades.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("import_rows_run_source_key_unique").on(t.runId, t.sourceKey),
    index("import_rows_run_idx").on(t.runId),
    index("import_rows_grade_idx").on(t.gradeId),
  ],
);

export const institution = pgTable("institution", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  logoPath: text("logo_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Campuses ─────────────────────────────────────────────────────────────────

export const campuses = pgTable(
  "campuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    address: text("address"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("campuses_name_unique").on(t.name),
    uniqueIndex("campuses_code_unique").on(t.code),
  ],
);

export const admins = pgTable(
  "admins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    password: text("password").notNull(),
    campusId: uuid("campus_id").references(() => campuses.id),
    role: roleEnum("role").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("admins_email_unique").on(t.email)],
);

/**
 * Junction table: admin ↔ campus (many-to-many).
 *
 * Rules:
 *   - SUPER_ADMIN:   zero rows here → sees everything.
 *   - ADMIN/VIEWER:  one or more rows → restricted to those campuses only.
 */
export const adminCampuses = pgTable(
  "admin_campuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .references(() => admins.id, { onDelete: "cascade" })
      .notNull(),
    campusId: uuid("campus_id")
      .references(() => campuses.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("admin_campuses_unique").on(t.adminId, t.campusId),
    index("admin_campuses_admin_idx").on(t.adminId),
  ],
);

export const programmes = pgTable(
  "programmes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    shortName: varchar("short_name", { length: 255 }),
    duration: integer("duration"),
    programmeType: programmeTypeEnum("programme_type")
      .notNull()
      .default("DEGREE"),
    progType: varchar("prog_type", { length: 100 }),
    category: varchar("category", { length: 100 }),
    programmeCampus: varchar("programme_campus", { length: 150 }),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("programmes_name_code_unique").on(t.name, t.code),
    // uniqueIndex("programmes_code_unique").on(t.code),
  ],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    oldStudId: varchar("old_stud_id", { length: 100 }),
    regno: varchar("regno", { length: 100 }),
    indexNumber: varchar("index_number", { length: 100 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    middleName: varchar("middle_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    studentType: studentTypeEnum("student_type")
      .notNull()
      .default("UNDERGRADUATE"),
    dateOfBirth: date("date_of_birth"),
    gender: varchar("gender", { length: 10 }),
    programmeId: uuid("programme_id")
      .references(() => programmes.id)
      .notNull(),
    level: integer("level").notNull(),
    campusId: uuid("campus_id").references(() => campuses.id),
    entryYear: varchar("entry_year", { length: 15 }).notNull(),
    graduationYear: varchar("graduation_year", { length: 15 }),
    status: studentStatusEnum("status").default("ACTIVE").notNull(),
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("students_regno_unique").on(t.regno)],
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceCourseId: integer("source_course_id").notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    category: courseCategoryEnum("category").default("OSIS_NEW").notNull(),
    creditHours: integer("credit_hours").notNull(),
    isScoring: boolean("is_scoring").default(true),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("courses_code_category_unique").on(t.category, t.code),
    uniqueIndex("courses_source_course_id_unique").on(t.sourceCourseId),
  ],
);

export const courseSourceMap = pgTable(
  "course_source_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceCourseId: integer("source_course_id").notNull().unique(),
    courseId: uuid("course_id").notNull(),
  },
  (t) => [uniqueIndex("course_source_map_course_id_idx").on(t.courseId)],
);

export const semesters = pgTable(
  "semesters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    year: integer("year").notNull(),
    semester: semesterEnum("semester").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("unique_year_semester").on(t.year, t.semester)],
);

export const grades = pgTable(
  "grades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .references(() => students.id)
      .notNull(),
    courseId: uuid("course_id")
      .references(() => courses.id)
      .notNull(),
    semesterId: uuid("semester_id")
      .references(() => semesters.id)
      .notNull(),
    grade: gradeEnum("grade").notNull(),
    gradePoint: numeric("grade_point", { precision: 3, scale: 2 }).notNull(),
    creditHours: integer("credit_hours").notNull(),
    computedQualityPoints: numeric("computed_quality_points", {
      precision: 6,
      scale: 2,
    }).notNull(),
    isResit: boolean("is_resit").default(false).notNull(),
    isSuperseded: boolean("is_superseded").default(false).notNull(),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("unique_active_student_course_semester")
      .on(t.studentId, t.courseId, t.semesterId)
      .where(sql`is_superseded = false`),
    index("grades_student_idx").on(t.studentId),
    index("grades_semester_idx").on(t.semesterId),
    index("grades_student_semester_idx").on(t.studentId, t.semesterId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .references(() => admins.id)
      .notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddress: varchar("ip_address", { length: 100 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_admin_idx").on(t.adminId),
  ],
);

export const registrar = pgTable("registrar", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  signaturePath: text("signature_path"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .references(() => students.id)
      .notNull(),
    transcriptNumber: varchar("transcript_number", { length: 100 }).notNull(),
    generatedBy: uuid("generated_by")
      .references(() => admins.id)
      .notNull(),
    fileKey: text("file_key"),
    checksum: varchar("checksum", { length: 64 }),
    status: transcriptStatusEnum("status").default("COMPLETED"),
    registrarId: uuid("registrar_id").references(() => registrar.id),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("transcript_number_unique").on(t.transcriptNumber),
    index("transcripts_student_idx").on(t.studentId),
    index("transcripts_created_at_idx").on(t.createdAt),
  ],
);

// ─── Password reset tokens ────────────────────────────────────────────────────
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .references(() => admins.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("prt_token_hash_unique").on(t.tokenHash),
    index("prt_admin_idx").on(t.adminId),
  ],
);

export const uploadJobs = pgTable("upload_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id")
    .references(() => admins.id)
    .notNull(),
  fileKey: text("file_key").notNull(),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  status: uploadJobStatusEnum("status").default("PENDING").notNull(),
  totalRows: integer("total_rows"),
  processedRows: integer("processed_rows").default(0),
  errorCount: integer("error_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const uploadJobRows = pgTable(
  "upload_job_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .references(() => uploadJobs.id)
      .notNull(),
    rowNumber: integer("row_number").notNull(),
    rowData: jsonb("row_data").notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    isValid: boolean("is_valid").default(false).notNull(),
  },
  (t) => [index("upload_job_rows_job_idx").on(t.jobId)],
);

export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("rate_limit_key_idx").on(t.key, t.createdAt)],
);
