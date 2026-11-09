"use client";

import { useState, useMemo, useOptimistic, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createStudentAction, updateStudentAction,
  deleteStudentAction,
} from "@/actions/crud/students";
import {
  PageHeader, Button, Badge, Modal, Field,
  Input, Select, ConfirmDialog, useToast,
} from "@/components/ui";
import { Pagination, usePagination } from "@/components/ui/pagination";
import type { ActionState } from "@/types/auth";

const IDLE: ActionState = { status: "idle" };

type Programme = { id: string; name: string; code: string; programmeType: string };
type Campus = { id: string; name: string; code: string };
type AdvancedCriteria = {
  indexNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  programmeId: string;
  campusId: string;
  level: string;
  entryYear: string;
  graduationYear: string;
  dateOfBirth: string;
  studentType: string;
  status: string;
  gender: string;
};
type Student = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  indexNumber: string;
  status: string;
  programmeId: string;
  programmeName: string | null;
  campusId: string | null;
  campusName: string | null;
  level: number;
  studentType: string | null;
  entryYear: string;
  graduationYear: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phoneNumber: string | null;
};

type Props = {
  initial: Student[];
  programmes: Programme[];
  campuses: Campus[];
  initialQuery?: string;
  initialFilters: AdvancedCriteria;
  canCreateStudents: boolean;
  canEditStudents: boolean;
  canDeleteStudents: boolean;
};

const STATUS_BADGE: Record<string, "green" | "gray" | "red"> = {
  ACTIVE: "green",
  GRADUATED: "gray",
  WITHDRAWN: "red",
};

function genderFormValue(gender: string | null): string {
  switch (gender?.trim().toUpperCase()) {
    case "M":
    case "MALE":
      return "MALE";
    case "F":
    case "FEMALE":
      return "FEMALE";
    case "O":
    case "OTHER":
      return "OTHER";
    default:
      return "";
  }
}

export function StudentsClient({
  initial,
  programmes,
  campuses,
  initialQuery = "",
  initialFilters,
  canCreateStudents,
  canEditStudents,
  canDeleteStudents,
}: Props) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [students, setOptimistic] = useOptimistic(initial);
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [criteria, setCriteria] = useState(initialFilters);
  const [appliedCriteria, setAppliedCriteria] = useState(initialFilters);
  const [advancedOpen, setAdvancedOpen] = useState(
    () => Object.values(initialFilters).some(Boolean),
  );
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "GRADUATED" | "WITHDRAWN">("all");

  const hasAppliedCriteria = Object.values(appliedCriteria).some(Boolean);
  const hasSearch = Boolean(search || hasAppliedCriteria);

  function setCriterion(key: keyof AdvancedCriteria, value: string) {
    setCriteria((current) => ({ ...current, [key]: value }));
  }

  // Submit both broad and field-specific criteria to the server-side search.
  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = inputValue.trim();
    const nextCriteria: AdvancedCriteria = {
      indexNumber: criteria.indexNumber.trim(),
      firstName: criteria.firstName.trim(),
      middleName: criteria.middleName.trim(),
      lastName: criteria.lastName.trim(),
      email: criteria.email.trim(),
      phoneNumber: criteria.phoneNumber.trim(),
      programmeId: criteria.programmeId,
      campusId: criteria.campusId,
      level: criteria.level.trim(),
      entryYear: criteria.entryYear.trim(),
      graduationYear: criteria.graduationYear.trim(),
      dateOfBirth: criteria.dateOfBirth,
      studentType: criteria.studentType,
      status: criteria.status,
      gender: criteria.gender,
    };
    const hasCriteria = Object.values(nextCriteria).some(Boolean);
    if (q.length === 1 && !hasCriteria) return;

    const params = new URLSearchParams();
    if (q.length >= 2) params.set("q", q);
    for (const [key, value] of Object.entries(nextCriteria)) {
      if (value) params.set(key, value);
    }

    setSearch(q.length >= 2 ? q : "");
    setAppliedCriteria(nextCriteria);
    setPage(1);
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  function clearSearch() {
    setInputValue("");
    setSearch("");
    setCriteria({
      indexNumber: "", firstName: "", middleName: "", lastName: "",
      programmeId: "", campusId: "", level: "",
      entryYear: "", graduationYear: "", dateOfBirth: "", email: "",
      phoneNumber: "", studentType: "", status: "", gender: "",
    });
    setAppliedCriteria({
      indexNumber: "", firstName: "", middleName: "", lastName: "",
      programmeId: "", campusId: "", level: "",
      entryYear: "", graduationYear: "", dateOfBirth: "", email: "",
      phoneNumber: "", studentType: "", status: "", gender: "",
    });
    setStatusFilter("all");
    setPage(1);
    router.push(pathname);
  }
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [delLoading, setDelLoading] = useState(false);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() =>
    students.filter(s => {
      const matchSearch = !q
        || s.indexNumber.toLowerCase().includes(q)
        || `${s.firstName} ${s.middleName ?? ""} ${s.lastName}`.toLowerCase().includes(q)
        || (s.programmeName ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    }),
    [students, q, statusFilter]);

  const { page, perPage, total, totalPages, paginated, setPage, setPerPage } =
    usePagination(filtered);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleCreate(formData: FormData) {
    const r = await createStudentAction(IDLE, formData);
    if (r.status === "success") { toast.success("Student added"); setShowCreate(false); window.location.reload(); }
    else if (r.status === "error") toast.error(r.error);
  }

  async function handleEdit(formData: FormData) {
    const r = await updateStudentAction(IDLE, formData);
    if (r.status === "success") { toast.success("Student updated"); setEditing(null); window.location.reload(); }
    else if (r.status === "error") toast.error(r.error);
  }

  async function handleDelete() {
    if (!deleting) return;
    setDelLoading(true);
    const r = await deleteStudentAction(deleting.id);
    setDelLoading(false); setDeleting(null);
    if (r.status === "success") {
      toast.success("Student deleted");
      startTransition(() => setOptimistic(prev => prev.filter(s => s.id !== deleting.id)));
    } else if (r.status === "error") toast.error(r.error);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description={`${students.length} student${students.length !== 1 ? "s" : ""}`}
        action={canCreateStudents ? (
          <Button variant="primary" onClick={() => setShowCreate(true)} icon={<PlusIcon />}>Add student</Button>
        ) : undefined}
      />

      {/* Search and advanced field filters */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <SearchIcon className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="search"
                placeholder="Search any name, index number or programme…"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <button type="submit"
              className="rounded-lg bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 whitespace-nowrap">
              Search
            </button>
            <button type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2.5 text-sm font-medium text-indigo-950 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/50">
              <FilterIcon />
              Advanced search
              {Object.values(criteria).some(Boolean) && (
                <span className="rounded-full bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {Object.values(criteria).filter(Boolean).length}
                </span>
              )}
            </button>
            {(hasSearch || statusFilter !== "all" || Object.values(criteria).some(Boolean)) && (
              <button type="button" onClick={clearSearch}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Clear
              </button>
            )}
          </div>

          {advancedOpen && (
            <fieldset className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
              <legend className="sr-only">Advanced student search</legend>
              <SearchField label="Index number">
                <input value={criteria.indexNumber} onChange={(e) => setCriterion("indexNumber", e.target.value)} placeholder="e.g. WIN/2023/001" className={searchFieldClass} />
              </SearchField>
              <SearchField label="First name">
                <input value={criteria.firstName} onChange={(e) => setCriterion("firstName", e.target.value)} placeholder="First name" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Middle name">
                <input value={criteria.middleName} onChange={(e) => setCriterion("middleName", e.target.value)} placeholder="Middle name" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Last name">
                <input value={criteria.lastName} onChange={(e) => setCriterion("lastName", e.target.value)} placeholder="Last name" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Email">
                <input value={criteria.email} onChange={(e) => setCriterion("email", e.target.value)} placeholder="student@example.com" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Phone number">
                <input value={criteria.phoneNumber} onChange={(e) => setCriterion("phoneNumber", e.target.value)} placeholder="Phone number" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Programme">
                <Select value={criteria.programmeId} onChange={(e) => setCriterion("programmeId", e.target.value)}>
                  <option value="">All programmes</option>
                  {programmes.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </Select>
              </SearchField>
              <SearchField label="Campus">
                <Select value={criteria.campusId} onChange={(e) => setCriterion("campusId", e.target.value)}>
                  <option value="">All accessible campuses</option>
                  {campuses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </Select>
              </SearchField>
              <SearchField label="Level">
                <input type="number" min={100} max={900} step={1} value={criteria.level} onChange={(e) => setCriterion("level", e.target.value)} placeholder="e.g. 200" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Entry year">
                <input value={criteria.entryYear} onChange={(e) => setCriterion("entryYear", e.target.value)} placeholder="e.g. 2022 or 2022/2023" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Graduation year">
                <input value={criteria.graduationYear} onChange={(e) => setCriterion("graduationYear", e.target.value)} placeholder="e.g. 2025/2026" className={searchFieldClass} />
              </SearchField>
              <SearchField label="Date of birth">
                <input type="date" value={criteria.dateOfBirth} onChange={(e) => setCriterion("dateOfBirth", e.target.value)} className={searchFieldClass} />
              </SearchField>
              <SearchField label="Student type">
                <Select value={criteria.studentType} onChange={(e) => setCriterion("studentType", e.target.value)}>
                  <option value="">All student types</option>
                  <option value="UNDERGRADUATE">Undergraduate</option>
                  <option value="POSTGRADUATE">Postgraduate</option>
                </Select>
              </SearchField>
              <SearchField label="Status">
                <Select value={criteria.status} onChange={(e) => setCriterion("status", e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="GRADUATED">Graduated</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                </Select>
              </SearchField>
              <SearchField label="Gender">
                <Select value={criteria.gender} onChange={(e) => setCriterion("gender", e.target.value)}>
                  <option value="">Any gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </SearchField>
            </fieldset>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          {(["all", "ACTIVE", "GRADUATED", "WITHDRAWN"] as const).map(f => (
            <button key={f} type="button"
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={["px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                statusFilter === f
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800",
              ].join(" ")}>
              {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {(q || statusFilter !== "all") && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{total} result{total !== 1 ? "s" : ""}</span>
        )}
        </div>
      </div>

      {/* Empty states */}
      {/* Search prompt — shown before any search is made */}
      {!hasSearch && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center dark:border-gray-700 dark:bg-gray-900/30">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950">
            <SearchIcon className="h-5 w-5 text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Search for a student</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            Enter a name or index number above and press <kbd className="rounded border border-gray-300 px-1.5 py-0.5 font-mono text-xs">Enter</kbd> or click Search.
          </p>
        </div>
      )}

      {hasSearch && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-900/30">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No students match your search</p>
          <button type="button" onClick={clearSearch}
            className="mt-3 text-xs text-indigo-600 hover:underline dark:text-indigo-400">Clear filters</button>
        </div>
      )}

      {/* Student cards */}
      {paginated.length > 0 && (
        <div className="space-y-3">
          {paginated.map(s => (
            <StudentCard key={s.id} student={s} canEdit={canEditStudents} canDelete={canDeleteStudents}
              onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />
          ))}
          <Pagination page={page} perPage={perPage} total={total} totalPages={totalPages}
            onPage={setPage} onPerPage={setPerPage} />
        </div>
      )}

      {/* ── Create modal ──────────────────────────────────────────────────────── */}
      {canCreateStudents && <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add student" size="xl"
        footer={<>
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-student-form">Add student</Button>
        </>}>
        <form id="create-student-form" action={handleCreate} className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <div className="rounded-lg border-l-4 border-red-700 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 sm:col-span-2 dark:bg-indigo-950/50 dark:text-indigo-100">
            Enter the student&apos;s academic and contact details. Required fields are marked with an asterisk.
          </div>
          <Field label="First name" required>
            <Input name="firstName" placeholder="Ama" required />
          </Field>
          <Field label="Last name" required>
            <Input name="lastName" placeholder="Asante" required />
          </Field>
          <Field label="Middle name" hint="Optional — leave blank if none">
            <Input name="middleName" placeholder="Serwaa" />
          </Field>
          <Field label="Index number" required hint="Must be unique, e.g. WIN/2023/001">
            <Input name="indexNumber" placeholder="WIN/2023/001" required />
          </Field>
          <Field label="Campus" required>
            <Select name="campusId" required defaultValue="">
              <option value="">Select campus</option>
              {campuses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Programme" required>
            <Select name="programmeId" required defaultValue="">
              <option value="">Select programme</option>
              {programmes.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Level" required hint="For example: 101, 201 or 701">
            <Input name="level" type="number" min={100} max={900} step={1} placeholder="100" required />
          </Field>
          <Field label="Student type" required>
            <Select name="studentType" defaultValue="UNDERGRADUATE">
              <option value="UNDERGRADUATE">Undergraduate</option>
              <option value="POSTGRADUATE">Postgraduate</option>
            </Select>
          </Field>
          <Field label="Entry year" required hint="For example: 2021 or 2021/2022">
            <Input name="entryYear" placeholder="2021/2022" required />
          </Field>
          <Field label="Graduation year" hint="Leave blank if still active">
            <Input name="graduationYear" placeholder="2025/2026" />
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue="">
              <option value="">Select gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Input name="dateOfBirth" type="date" />
          </Field>
          <Field label="Email" hint="Optional">
            <Input name="email" type="email" placeholder="student@email.com" />
          </Field>
          <Field label="Phone number" hint="Optional">
            <Input name="phoneNumber" placeholder="+233 24 000 0000" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Status">
              <Select name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="GRADUATED">Graduated</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>}

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {canEditStudents && <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit student" size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-student-form">Save changes</Button>
        </>}>
        {editing && (
          <form
            id="edit-student-form"
            action={handleEdit}
            className="grid max-h-[calc(100dvh-13rem)] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={editing.id} />
            <Field label="First name" required>
              <Input name="firstName" defaultValue={editing.firstName} required />
            </Field>
            <Field label="Last name" required>
              <Input name="lastName" defaultValue={editing.lastName} required />
            </Field>
            <Field label="Middle name">
              <Input name="middleName" defaultValue={editing.middleName ?? ""} />
            </Field>
            <Field label="Index number" required>
              <Input name="indexNumber" defaultValue={editing.indexNumber} required />
            </Field>
            <Field label="Campus">
              <Select name="campusId" defaultValue={editing.campusId ?? ""}>
                {canDeleteStudents && <option value="">— No campus —</option>}
                {campuses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </Select>
            </Field>
            <Field label="Programme" required>
              <Select name="programmeId" defaultValue={editing.programmeId}>
                {programmes.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </Select>
            </Field>
            <Field label="Level" required>
              <Input name="level" type="number" min={100} max={900} step={1} defaultValue={editing.level} required />
            </Field>
            <Field label="Student type" required>
              <Select name="studentType" defaultValue={editing.studentType ?? "UNDERGRADUATE"}>
                <option value="UNDERGRADUATE">Undergraduate</option>
                <option value="POSTGRADUATE">Postgraduate</option>
              </Select>
            </Field>
            <Field label="Entry year" required>
              <Input name="entryYear" defaultValue={editing.entryYear} required />
            </Field>
            <Field label="Graduation year">
              <Input name="graduationYear" defaultValue={editing.graduationYear ?? ""} />
            </Field>
            <Field label="Gender">
              <Select name="gender" defaultValue={genderFormValue(editing.gender)}>
                <option value="">— Select —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth">
              <Input name="dateOfBirth" type="date" defaultValue={editing.dateOfBirth ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={editing.email ?? ""} />
            </Field>
            <Field label="Phone number">
              <Input name="phoneNumber" defaultValue={editing.phoneNumber ?? ""} />
            </Field>
            {canDeleteStudents && (
              <Field label="Status">
                <Select name="status" defaultValue={editing.status}>
                  <option value="ACTIVE">Active</option>
                  <option value="GRADUATED">Graduated</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                </Select>
              </Field>
            )}
          </form>
        )}
      </Modal>}

      {canDeleteStudents && <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete}
        title="Delete student"
        message={`Delete ${deleting?.firstName} ${deleting?.lastName} (${deleting?.indexNumber})? Their grade records will also be removed. This cannot be undone.`}
        confirmLabel="Delete" danger loading={delLoading}
      />}
    </div>
  );
}

const searchFieldClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function SearchField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

// ─── Student card ─────────────────────────────────────────────────────────────

function StudentCard({
  student,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  student: Student;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:border-indigo-200 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")}
          </p>
          <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${student.studentType === "POSTGRADUATE"
            ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
            : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
            }`}>
            {student.studentType === "POSTGRADUATE" ? "Postgrad" : "Undergrad"}
          </span>
          <Badge variant={STATUS_BADGE[student.status] ?? "gray"}>
            {student.status.charAt(0) + student.status.slice(1).toLowerCase()}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{student.indexNumber}</span>
          {student.programmeName && (
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{student.programmeName}</span>
          )}
          {student.campusName && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400">{student.campusName}</span>
          )}
          <span className="text-xs text-gray-400">Level {student.level} · {student.entryYear}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-4 sm:justify-end">
          <Link
            href={`/transcripts?q=${encodeURIComponent(student.indexNumber)}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            <TranscriptPrintIcon />
            Print transcript
          </Link>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="border border-indigo-200 text-indigo-900 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
            >
              Edit bio
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="border border-red-200 text-red-800 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/50"
            >
              Delete
            </Button>
          )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
  </svg>;
}
function FilterIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
    </svg>
  );
}
function TranscriptPrintIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25V3.75h9v4.5m-9 9.75h-2.25A2.25 2.25 0 0 1 3 15.75v-4.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v4.5A2.25 2.25 0 0 1 18.75 18H16.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15.75h9v4.5h-9zM17.25 12.75h.008v.008h-.008z" />
    </svg>
  );
}