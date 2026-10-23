"use client";

import { useActionState, useState, useEffect } from "react";
import { createGradeAction, getGradesForStudent, deleteGradeAction } from "@/actions/crud/grades";
import {
  DEFAULT_GRADE_SCALE,
  NON_SCORING_GRADE_LETTERS,
} from "@/lib/gpa/scale";
import type { Course } from "@/actions/crud/courses";
import type { Semester } from "@/actions/crud/semesters";
import {
  PageHeader, Button, Badge, SearchBar, EmptyState,
  Table, Thead, Th, Tbody, Tr, Td,
  Field, Select, useToast, Spinner, ConfirmDialog,
} from "@/components/ui";

type Student = {
  id: string;
  indexNumber: string;
  firstName: string;
  lastName: string;
  programmeName: string | null;
};

const IDLE = { status: "idle" } as const;

function isStudentSearchResult(value: unknown): value is Student {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.indexNumber === "string" &&
    typeof row.firstName === "string" &&
    typeof row.lastName === "string" &&
    (typeof row.programmeName === "string" || row.programmeName === null)
  );
}

const GRADE_COLORS: Record<string, "green" | "blue" | "amber" | "red" | "gray"> = {
  "A": "green", "B+": "green", "B": "blue", "C+": "blue",
  "C": "amber", "D+": "amber", "D": "amber", "E": "red", "F": "red",
};

export function GradesClient({
  semesters, courses,
}: {
  semesters: Semester[];
  courses: Course[];
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [studentGrades, setStudentGrades] = useState<Awaited<ReturnType<typeof getGradesForStudent>>>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [gradeLoadError, setGradeLoadError] = useState<string | null>(null);
  const [showEntry, setShowEntry] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [delLoading, setDelLoading] = useState(false);

  const [gradeState, gradeAction] = useActionState(createGradeAction, IDLE);
  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const gradeOptions: [string, number][] =
    selectedCourse?.isScoring === false
      ? NON_SCORING_GRADE_LETTERS.map(
          (grade): [string, number] => [grade, DEFAULT_GRADE_SCALE[grade]],
        )
      : Object.entries(DEFAULT_GRADE_SCALE).filter(([grade]) => grade !== "P");

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || selectedStudent) {
      setFilteredStudents([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setFilteredStudents([]);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/students/search?q=${encodeURIComponent(query)}&limit=8`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Student search is unavailable. Please try again.");
        const rows: unknown = await response.json();
        if (!Array.isArray(rows) || !rows.every(isStudentSearchResult)) {
          throw new Error("Student search returned an invalid response.");
        }
        setFilteredStudents(rows);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFilteredStudents([]);
        setSearchError(error instanceof Error ? error.message : "Student search failed.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, selectedStudent]);

  async function loadStudentGrades(student: Student) {
    setSelectedStudent(student);
    setLoadingGrades(true);
    setGradeLoadError(null);
    try {
      const grades = await getGradesForStudent(student.id);
      setStudentGrades(grades);
    } catch {
      setStudentGrades([]);
      setGradeLoadError("Could not load this student's grades. Please try again.");
    } finally {
      setLoadingGrades(false);
    }
    setSearch("");
    setFilteredStudents([]);
  }

  // Handle grade creation success
  useEffect(() => {
    if (gradeState.status === "success" && selectedStudent) {
      toast.success("Grade submitted");
      setShowEntry(false);
      setSelectedCourseId("");
      loadStudentGrades(selectedStudent);
    } else if (gradeState.status === "error") {
      toast.error(gradeState.error);
    }
  }, [gradeState]);

  async function handleDelete() {
    if (!deleting) return;
    setDelLoading(true);
    const r = await deleteGradeAction(deleting);
    setDelLoading(false);
    setDeleting(null);
    if (r.status === "success") {
      toast.success("Grade deleted");
      if (selectedStudent) loadStudentGrades(selectedStudent);
    } else if (r.status === "error") {
      toast.error(r.error);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grades"
        description="Search for a student to view and enter their grades"
      />

      {/* Student search */}
      <div className="relative max-w-md">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search student by name or index number…"
        />
        {searching && (
          <p className="mt-2 text-sm text-slate-500" role="status">Searching students…</p>
        )}
        {searchError && (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{searchError}</p>
        )}
        {!searching && !searchError && search.trim().length >= 2 && filteredStudents.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">No students found.</p>
        )}
        {filteredStudents.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {filteredStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => loadStudentGrades(s)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold dark:bg-gray-800">
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {s.firstName} {s.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{s.indexNumber} · {s.programmeName}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Student grades panel */}
      {selectedStudent ? (
        <div className="space-y-4">
          {/* Student header */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white dark:bg-gray-700">
                {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </p>
                <p className="text-xs text-gray-500">{selectedStudent.indexNumber} · {selectedStudent.programmeName}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setSelectedStudent(null); setStudentGrades([]); setGradeLoadError(null); }}>
                Change student
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowEntry(true)} icon={<PlusIcon />}>
                Add grade
              </Button>
            </div>
          </div>

          {/* Grade entry form (inline below student header) */}
          {showEntry && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Enter grade</h3>
              <form action={gradeAction} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <input type="hidden" name="studentId" value={selectedStudent.id} />
                <Field label="Course" required>
                  <Select
                    name="courseId"
                    required
                    value={selectedCourseId}
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                  >
                    <option value="">Select course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title} · {c.category} ({c.creditHours} cr.)
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Semester" required>
                  <Select name="semesterId" required>
                    <option value="">Select semester…</option>
                    {[...semesters].reverse().map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.year}/{s.year + 1} {s.semester === "FIRST" ? "First" : "Second"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Grade" required>
                  <Select name="grade" required>
                    <option value="">Select grade…</option>
                    {gradeOptions.map(([g, pt]) => (
                      <option key={g} value={g}>{g} ({Number(pt).toFixed(1)})</option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    name="isResit"
                    value="true"
                    className="h-4 w-4 rounded border-slate-300 text-[#24496b] focus:ring-[#24496b]"
                  />
                  Resit attempt
                </label>
                <div className="flex gap-2 self-end pb-1">
                  <Button variant="primary" type="submit">Submit</Button>
                  <Button variant="ghost" type="button" onClick={() => { setShowEntry(false); setSelectedCourseId(""); }}>Cancel</Button>
                </div>
              </form>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Grade points use the selected grade. A resit doubles attempted credits, not quality points.
              </p>
            </div>
          )}

          {/* Grades table */}
          {loadingGrades ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size={24} />
            </div>
          ) : studentGrades.length === 0 ? (
            gradeLoadError ? (
              <EmptyState title="Grades unavailable" description={gradeLoadError} />
            ) : (
              <EmptyState
                title="No grades recorded"
                description="Use the Add grade button to enter results for this student"
              />
            )
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Course</Th>
                  <Th>Title</Th>
                  <Th>Semester</Th>
                  <Th>Cr. hrs</Th>
                  <Th>Grade</Th>
                  <Th>Grade pt</Th>
                  <Th>Quality pts</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </Thead>
              <Tbody>
                {studentGrades.map((g) => (
                  <Tr key={g.id}>
                    <Td><code className="text-xs font-mono">{g.courseCode}</code></Td>
                    <Td className="text-gray-700 dark:text-gray-300 max-w-xs truncate">{g.courseTitle}</Td>
                    <Td className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                      {g.semesterYear}/{g.semesterYear + 1} {g.semesterTerm === "FIRST" ? "First" : "Second"}
                    </Td>
                    <Td className="tabular-nums text-center">{g.creditHours}</Td>
                    <Td className="whitespace-nowrap">
                      <Badge variant={GRADE_COLORS[g.grade] ?? "gray"}>{g.grade}</Badge>
                      {g.isResit && <span className="ml-1"><Badge variant="purple">Resit</Badge></span>}
                    </Td>
                    <Td className="tabular-nums text-right">{parseFloat(g.gradePoint).toFixed(2)}</Td>
                    <Td className="tabular-nums text-right font-medium">{parseFloat(g.computedQualityPoints).toFixed(2)}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(g.id)}
                        className="text-red-600 hover:bg-red-50 dark:text-red-400">
                        Delete
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      ) : (
        <EmptyState
          title="Select a student"
          description="Use the search bar above to find a student and view their grades"
        />
      )}

      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete}
        title="Delete grade"
        message="Delete this grade record? Use the grade correction flow instead to preserve history."
        confirmLabel="Delete grade" danger loading={delLoading}
      />
    </div>
  );
}

function PlusIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
}