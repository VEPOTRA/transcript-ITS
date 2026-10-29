"use client";

/**
 * Grade entry form — updated with course category selector.
 *
 * Flow:
 *   1. Select student (by index number search)
 *   2. Select course category (OSIS OLD / OSIS NEW / ITS / OSIS 2)
 *   3. Select course (filtered by category)
 *   4. Select semester
 *   5. Select grade (P/F for non-scoring, A–F for scoring)
 *   6. Mark as resit if applicable
 */

import { useActionState, useState, useEffect, useMemo } from "react";
import { createGradeAction } from "@/actions/crud/grades";
import { useToast } from "@/components/ui";
import type { ActionState } from "@/types/auth";
import type { Semester } from "@/actions/crud/semesters";
import { NON_SCORING_GRADE_LETTERS } from "@/lib/gpa/scale";

const GRADE_LABELS: Record<string, string> = {
  "A": "A  — 4.00  (Excellent)",
  "B+": "B+ — 3.50  (Very Good)",
  "B": "B  — 3.00  (Good)",
  "C+": "C+ — 2.50  (Above Average)",
  "C": "C  — 2.00  (Average)",
  "D+": "D+ — 1.50  (Below Average)",
  "D": "D  — 1.00  (Marginal Pass)",
  "E": "E  — 0.00  (Fail)",
  "F": "F  — 0.00  (Fail)",
  "IC": "IC — 0.00  (Incomplete)",
};

const CATEGORY_LABELS: Record<string, string> = {
  OSIS_OLD: "OSIS Old Courses",
  OSIS_NEW: "OSIS New Courses",
  ITS: "ITS Courses",
  OSIS_2: "OSIS 2 Courses",
};

type Course = {
  id: string; code: string; title: string;
  creditHours: number; isScoring: boolean | null; category: string;
};
type Student = {
  id: string; indexNumber: string;
  firstName: string; middleName?: string | null; lastName: string;
  programmeName: string | null;
};

type Props = {
  semesters: Semester[];
  courses: Course[];
  // students loaded on-demand via search — not passed as props
};

const init: ActionState<{ id: string }> = { status: "idle" };

export function GradeEntryForm({ semesters, courses }: Props) {
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(createGradeAction, init);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // Get distinct categories from available courses
  const categories = useMemo(() =>
    [...new Set(courses.map(c => c.category))].sort(),
    [courses]
  );

  // Filter courses by selected category
  const filteredCourses = useMemo(() =>
    selectedCategory ? courses.filter(c => c.category === selectedCategory) : [],
    [courses, selectedCategory]
  );

  // Selected course details
  const selectedCourse = useMemo(() =>
    courses.find(c => c.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const isScoring = selectedCourse ? selectedCourse.isScoring !== false : true;
  const gradeOptions = isScoring
    ? Object.entries(GRADE_LABELS).filter(([grade]) => grade !== "P")
    : NON_SCORING_GRADE_LETTERS.map(
        (grade): [string, string] => [grade, GRADE_LABELS[grade]],
      );

  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);

  // Search students via API on-demand
  useEffect(() => {
    const q = studentSearch.trim();
    if (q.length < 2) { setFilteredStudents([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setFilteredStudents(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch { setFilteredStudents([]); }
      finally { setSearching(false); }
    }, 300); // debounce 300ms
    return () => clearTimeout(timer);
  }, [studentSearch]);

  // Reset course when category changes
  useEffect(() => { setSelectedCourseId(""); }, [selectedCategory]);

  // Toast on success/error
  useEffect(() => {
    if (state.status === "success") {
      toast.success("Grade submitted successfully");
      setSelectedStudent(null);
      setStudentSearch("");
      setSelectedCategory("");
      setSelectedCourseId("");
    }
  }, [state.status]);

  return (
    <form action={formAction} className="space-y-6 max-w-xl">

      {state.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {state.error}
        </div>
      )}

      {/* ── Student search ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Student <span className="text-red-500">*</span>
        </label>

        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/20">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {[selectedStudent.firstName, selectedStudent.middleName, selectedStudent.lastName].filter(Boolean).join(" ")}
              </p>
              <p className="text-xs text-gray-500 font-mono">{selectedStudent.indexNumber}</p>
              <p className="text-xs text-gray-400">{selectedStudent.programmeName}</p>
            </div>
            <button type="button" onClick={() => { setSelectedStudent(null); setStudentSearch(""); }}
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder="Search by index number or name…"
              className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {searching && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                Searching…
              </div>
            )}
            {!searching && filteredStudents.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {filteredStudents.map(s => (
                  <li key={s.id}>
                    <button type="button"
                      onClick={() => { setSelectedStudent(s); setStudentSearch(""); }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/20">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}
                      </span>
                      <span className="font-mono text-xs text-gray-500">{s.indexNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {selectedStudent && <input type="hidden" name="studentId" value={selectedStudent.id} />}
      </div>

      {/* ── Course category ────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Course category <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {categories.map(cat => (
            <button key={cat} type="button"
              onClick={() => setSelectedCategory(cat)}
              className={[
                "rounded-xl border px-3 py-2.5 text-sm font-medium transition-all text-left",
                selectedCategory === cat
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
              ].join(" ")}>
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Course selection ───────────────────────────────────────────────── */}
      {selectedCategory && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Course <span className="text-red-500">*</span>
          </label>
          <select name="courseId" value={selectedCourseId}
            onChange={e => setSelectedCourseId(e.target.value)} required
            className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            <option value="">— Select course —</option>
            {filteredCourses.map(course => (
              <option key={course.id} value={course.id}>
                {course.code} — {course.title}
                {course.isScoring === false ? " (non-scoring)" : ""}
              </option>
            ))}
          </select>
          {filteredCourses.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No courses found in this category. Create courses first.
            </p>
          )}
        </div>
      )}

      {/* ── Semester ───────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Semester <span className="text-red-500">*</span>
        </label>
        <select name="semesterId" required
          className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
          <option value="">— Select semester —</option>
          {semesters.map(s => (
            <option key={s.id} value={s.id}>
              {s.year}/{s.year + 1} — {s.semester === "FIRST" ? "First" : "Second"} Semester
            </option>
          ))}
        </select>
      </div>

      {/* ── Grade ──────────────────────────────────────────────────────────── */}
      {selectedCourseId && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Grade <span className="text-red-500">*</span>
          </label>
          {!isScoring && (
            <p className="text-xs text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-2">
              Non-scoring course — only <strong>P</strong> (Pass) or <strong>F</strong> (Fail) allowed.
              This course does not count toward GPA.
            </p>
          )}
          <select name="grade" required
            className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            <option value="">— Select grade —</option>
            {gradeOptions.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Resit toggle ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <input type="checkbox" id="isResit" name="isResit" value="true"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
        <div>
          <label htmlFor="isResit" className="block text-sm font-medium text-amber-800 dark:text-amber-300 cursor-pointer">
            This is a resit attempt
          </label>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            Credit hours count double in GPA for resit attempts.
          </p>
        </div>
      </div>

      {/* ── Submit ─────────────────────────────────────────────────────────── */}
      <button type="submit" disabled={isPending || !selectedStudent || !selectedCourseId}
        className={[
          "w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          isPending ? "bg-indigo-400" : "bg-indigo-600 hover:bg-indigo-700",
        ].join(" ")}>
        {isPending ? "Submitting…" : "Submit grade"}
      </button>
    </form>
  );
}