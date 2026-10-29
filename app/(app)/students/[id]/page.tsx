/**
 * /students/[id] — Student profile and academic record.
 *
 * Combines:
 *  - Student metadata panel
 *  - Live CGPA (from SQL aggregation)
 *  - Per-semester grade tables (display rows only — not used for GPA)
 *  - Status management (ADMIN+)
 *  - Links to transcript generation
 */

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAuth, can } from "@/lib/auth/rbac";
import { canAccessStudent } from "@/lib/auth/campus";
import { db } from "@/db";
import { students, programmes } from "@/db/schema";
import { fetchStudentGradeRows } from "@/lib/grades/queries";
import { calculateCGPA } from "@/lib/gpa";
import { formatGPA, formatSemesterLabel } from "@/lib/gpa";
import type { Metadata } from "next";
import { StudentStatusForm } from "./_components/student-status-form";

export const metadata: Metadata = { title: "Student profile — TMS" };

type PageProps = { params: Promise<{ id: string }> };

export default async function StudentDetailPage({ params }: PageProps) {
  const session = await requireAuth();
  const { id } = await params;

  const [studentRows, gradeRows, cgpa] = await Promise.all([
    db
      .select({
        id: students.id,
        campusId: students.campusId,
        indexNumber: students.indexNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        level: students.level,
        entryYear: students.entryYear,
        graduationYear: students.graduationYear,
        status: students.status,
        createdAt: students.createdAt,
        programmeName: programmes.name,
        programmeCode: programmes.code,
      })
      .from(students)
      .innerJoin(programmes, eq(students.programmeId, programmes.id))
      .where(eq(students.id, id))
      .limit(1),
    fetchStudentGradeRows(id),
    calculateCGPA(id),
  ]);

  if (studentRows.length === 0) notFound();
  const student = studentRows[0];
  if (!canAccessStudent(session, student.campusId)) notFound();

  const canEdit = session.role === "SUPER_ADMIN";
  const canGrades = can(session, "enter_grades");

  // Group display rows by semesterId for the tables (GPA already computed)
  const gradesBySemester = new Map<string, typeof gradeRows>();
  for (const row of gradeRows) {
    const existing = gradesBySemester.get(row.semesterId) ?? [];
    existing.push(row);
    gradesBySemester.set(row.semesterId, existing);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <a href="/students" className="hover:text-gray-700">Students</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{student.firstName} {student.lastName}</span>
      </nav>

      {/* Profile header */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Identity card */}
        <div className="col-span-2 flex items-start justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {student.firstName} {student.lastName}
            </h1>
            <p className="mt-1 font-mono text-sm text-gray-500">{student.indexNumber}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
              <span><span className="font-medium">Programme:</span> {student.programmeName} ({student.programmeCode})</span>
              <span><span className="font-medium">Level:</span> {student.level}</span>
              <span><span className="font-medium">Entry:</span> {student.entryYear}</span>
              {student.graduationYear && <span><span className="font-medium">Graduated:</span> {student.graduationYear}</span>}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={student.status} />
            {canEdit && <StudentStatusForm studentId={id} currentStatus={student.status} />}
          </div>
        </div>

        {/* CGPA card */}
        <div className="flex flex-col justify-between rounded-xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-blue-500">CGPA</p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-blue-700">
              {formatGPA(cgpa.cgpa)}
            </p>
            <p className="mt-1 text-sm font-medium text-blue-600">{cgpa.classification}</p>
          </div>
          <div className="mt-4 space-y-1 text-xs text-blue-600">
            <div className="flex justify-between">
              <span>Credits attempted</span>
              <span className="font-medium">{cgpa.totalCreditsAttempted}</span>
            </div>
            <div className="flex justify-between">
              <span>Credits earned</span>
              <span className="font-medium">{cgpa.totalCreditsEarned}</span>
            </div>
            <div className="flex justify-between">
              <span>Quality points</span>
              <span className="font-medium">{cgpa.totalQualityPoints.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex gap-3">
        <a
          href={`/transcripts/${id}`}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          View transcript
        </a>
        {canGrades && (
          <a
            href={`/grades/enter?studentId=${id}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Enter grade
          </a>
        )}
        {canEdit && (
          <a
            href={`/students/${id}/edit`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit details
          </a>
        )}
      </div>

      {/* Semester breakdown */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Academic results</h2>

        {cgpa.semesters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-10 text-center text-sm text-gray-500">
            No grade records found.
            {canGrades && (
              <> <a href={`/grades/enter?studentId=${id}`} className="text-blue-600 hover:underline">Enter the first grade</a></>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {cgpa.semesters.map((sem) => {
              const semRows = gradesBySemester.get(sem.semesterId) ?? [];
              return (
                <div key={sem.semesterId} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between bg-gray-900 px-5 py-3 text-white">
                    <span className="text-sm font-medium">
                      {formatSemesterLabel(sem.semesterYear, sem.semesterTerm)}
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span>Credits: <strong>{sem.creditsAttempted}</strong></span>
                      <span>QP: <strong>{sem.totalQualityPoints.toFixed(2)}</strong></span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 font-bold text-gray-900">
                        SGPA {sem.sgpaFormatted}
                      </span>
                    </div>
                  </div>
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Code", "Course", "Cr hrs", "Grade", "Grade pt", "Quality pts"].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {semRows.map((g) => (
                        <tr key={g.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{g.courseCode}</td>
                          <td className="px-4 py-2.5 text-gray-900">
                            {g.courseTitle}
                            {g.isScoring === false && (
                              <span className="ml-1.5 rounded bg-gray-100 px-1 text-xs text-gray-500">non-scoring</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-700">{g.creditHours}</td>
                          <td className="px-4 py-2.5 text-center">
                            <GradeBadge grade={g.grade} />
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">
                            {parseFloat(g.gradePoint).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {parseFloat(g.computedQualityPoints).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    GRADUATED: "bg-blue-100 text-blue-800",
    WITHDRAWN: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${c[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800", "B+": "bg-emerald-100 text-emerald-800",
  B: "bg-teal-100 text-teal-800", "C+": "bg-yellow-100 text-yellow-800",
  C: "bg-amber-100 text-amber-800", "D+": "bg-orange-100 text-orange-800",
  D: "bg-red-100 text-red-700", F: "bg-red-200 text-red-900",
};

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[grade] ?? "bg-gray-100 text-gray-700"}`}>
      {grade}
    </span>
  );
}
