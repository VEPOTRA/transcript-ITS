"use client";

import { useState, useMemo, useOptimistic, useTransition } from "react";
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
};

const STATUS_BADGE: Record<string, "green" | "gray" | "red"> = {
  ACTIVE: "green",
  GRADUATED: "gray",
  WITHDRAWN: "red",
};

export function StudentsClient({ initial, programmes, campuses, initialQuery = "" }: Props) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [students, setOptimistic] = useOptimistic(initial);
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "GRADUATED" | "WITHDRAWN">("all");

  // Submit search — updates URL which triggers server-side DB query
  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = inputValue.trim();
    if (q.length < 2 && q.length > 0) return; // wait for at least 2 chars
    setSearch(q);
    router.push(`${pathname}?q=${encodeURIComponent(q)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
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
        action={<Button variant="primary" onClick={() => setShowCreate(true)} icon={<PlusIcon />}>Add student</Button>}
      />

      {/* Search + status filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex flex-1 min-w-[200px] max-w-md gap-2">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <SearchIcon className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="search"
              placeholder="Enter index number or name…"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="block w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <button type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 whitespace-nowrap">
            Search
          </button>
          {search && (
            <button type="button"
              onClick={() => { setInputValue(""); setSearch(""); router.push(pathname); }}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
              Clear
            </button>
          )}
        </form>
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

      {/* Empty states */}
      {/* Search prompt — shown before any search is made */}
      {!search && (
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

      {students.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-900/30">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No students match your search</p>
          <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}
            className="mt-3 text-xs text-indigo-600 hover:underline dark:text-indigo-400">Clear filters</button>
        </div>
      )}

      {/* Student cards */}
      {paginated.length > 0 && (
        <div className="space-y-3">
          {paginated.map(s => (
            <StudentCard key={s.id} student={s}
              onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />
          ))}
          <Pagination page={page} perPage={perPage} total={total} totalPages={totalPages}
            onPage={setPage} onPerPage={setPerPage} />
        </div>
      )}

      {/* ── Create modal ──────────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add student"
        footer={<>
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-student-form">Add student</Button>
        </>}>
        <form id="create-student-form" action={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name" required>
              <Input name="firstName" placeholder="Ama" required />
            </Field>
            <Field label="Last name" required>
              <Input name="lastName" placeholder="Asante" required />
            </Field>
          </div>
          <Field label="Middle name" hint="Optional — leave blank if none">
            <Input name="middleName" placeholder="Serwaa" />
          </Field>
          <Field label="Index number" required hint="Must be unique e.g. WIN/2023/001">
            <Input name="indexNumber" placeholder="WIN/2023/001" required />
          </Field>
          <Field label="Campus" required>
            <Select name="campusId">
              <option value="">— Select campus —</option>
              {campuses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Programme" required>
            <Select name="programmeId">
              <option value="">— Select programme —</option>
              {programmes.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Level" required hint="100, 200, 300, 400 or 500">
              <Input name="level" type="number" min={100} max={900} step={100} placeholder="100" required />
            </Field>
            <Field label="Student type" required>
              <Select name="studentType" defaultValue="UNDERGRADUATE">
                <option value="UNDERGRADUATE">Undergraduate</option>
                <option value="POSTGRADUATE">Postgraduate</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Entry year" required hint='e.g. 2021 or 2021/2022'>
              <Input name="entryYear" placeholder="2021/2022" required />
            </Field>
            <Field label="Graduation year" hint="Leave blank if still active">
              <Input name="graduationYear" placeholder="2025/2026" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Gender">
              <Select name="gender">
                <option value="">— Select —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth">
              <Input name="dateOfBirth" type="date" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" hint="Optional">
              <Input name="email" type="email" placeholder="student@email.com" />
            </Field>
            <Field label="Phone number" hint="Optional">
              <Input name="phoneNumber" placeholder="+233 24 000 0000" />
            </Field>
          </div>
          <Field label="Status">
            <Select name="status" defaultValue="ACTIVE">
              <option value="ACTIVE">Active</option>
              <option value="GRADUATED">Graduated</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </Select>
          </Field>
        </form>
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit student"
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-student-form">Save changes</Button>
        </>}>
        {editing && (
          <form id="edit-student-form" action={handleEdit} className="space-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" required>
                <Input name="firstName" defaultValue={editing.firstName} required />
              </Field>
              <Field label="Last name" required>
                <Input name="lastName" defaultValue={editing.lastName} required />
              </Field>
            </div>
            <Field label="Middle name">
              <Input name="middleName" defaultValue={editing.middleName ?? ""} />
            </Field>
            <Field label="Index number" required>
              <Input name="indexNumber" defaultValue={editing.indexNumber} required />
            </Field>
            <Field label="Campus">
              <Select name="campusId" defaultValue={editing.campusId ?? ""}>
                <option value="">— No campus —</option>
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
            <div className="grid grid-cols-2 gap-4">
              <Field label="Level" required>
                <Input name="level" type="number" min={100} max={900} step={100} defaultValue={editing.level} required />
              </Field>
              <Field label="Student type" required>
                <Select name="studentType" defaultValue={editing.studentType ?? "UNDERGRADUATE"}>
                  <option value="UNDERGRADUATE">Undergraduate</option>
                  <option value="POSTGRADUATE">Postgraduate</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Entry year" required>
                <Input name="entryYear" defaultValue={editing.entryYear} required />
              </Field>
              <Field label="Graduation year">
                <Input name="graduationYear" defaultValue={editing.graduationYear ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gender">
                <Select name="gender" defaultValue={editing.gender ?? ""}>
                  <option value="">— Select —</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Date of birth">
                <Input name="dateOfBirth" type="date" defaultValue={editing.dateOfBirth ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email">
                <Input name="email" type="email" defaultValue={editing.email ?? ""} />
              </Field>
              <Field label="Phone number">
                <Input name="phoneNumber" defaultValue={editing.phoneNumber ?? ""} />
              </Field>
            </div>
            <Field label="Status">
              <Select name="status" defaultValue={editing.status}>
                <option value="ACTIVE">Active</option>
                <option value="GRADUATED">Graduated</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </Select>
            </Field>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete}
        title="Delete student"
        message={`Delete ${deleting?.firstName} ${deleting?.lastName} (${deleting?.indexNumber})? Their grade records will also be removed. This cannot be undone.`}
        confirmLabel="Delete" danger loading={delLoading}
      />
    </div>
  );
}

// ─── Student card ─────────────────────────────────────────────────────────────

function StudentCard({ student, onEdit, onDelete }: { student: Student; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow dark:border-gray-800 dark:bg-gray-900">
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
      <div className="ml-4 flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
          Delete
        </Button>
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