"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  createCourseAction, updateCourseAction,
  toggleCourseActiveAction, toggleCourseScoringAction,
  deleteCourseAction, type Course,
} from "@/actions/crud/courses";
import {
  PageHeader, Button, Badge, SearchBar, EmptyState,
  Table, Thead, Th, Tbody, Tr, Td,
  Modal, ConfirmDialog, Field, Input, Select,
  useToast,
} from "@/components/ui";
import { Pagination, usePagination } from "@/components/ui/pagination";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  type CourseCategory,
} from "@/lib/courses/categories";

const IDLE = { status: "idle" } as const;

export function CoursesClient({ initial }: { initial: Course[] }) {
  const toast = useToast();
  const [courses, setOptimistic] = useOptimistic(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<CourseCategory | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Reset page when search/filter changes handled in onPage/onPerPage
  const filtered = courses.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = c.code.toLowerCase().includes(q)
      || c.title.toLowerCase().includes(q)
      || COURSE_CATEGORY_LABELS[c.category].toLowerCase().includes(q);
    const matchFilter = filter === "all" || (filter === "active" ? c.isActive : !c.isActive);
    const matchCategory = categoryFilter === "all" || c.category === categoryFilter;
    return matchSearch && matchFilter && matchCategory;
  });

  const { page, perPage, total, totalPages, paginated, setPage, setPerPage } =
    usePagination(filtered);

  async function handleCreate(formData: FormData) {
    const r = await createCourseAction(IDLE, formData);
    if (r.status === "success") { toast.success("Course created"); setShowCreate(false); }
    else if (r.status === "error") toast.error(r.error);
  }

  async function handleEdit(formData: FormData) {
    const r = await updateCourseAction(IDLE, formData);
    if (r.status === "success") { toast.success("Course updated"); setEditing(null); }
    else if (r.status === "error") toast.error(r.error);
  }

  async function handleToggle(c: Course, field: "active" | "scoring") {
    startTransition(async () => {
      setOptimistic((prev) =>
        prev.map((x) => x.id === c.id
          ? { ...x, ...(field === "active" ? { isActive: !x.isActive } : { isScoring: !x.isScoring }) }
          : x
        )
      );
      const fn = field === "active" ? toggleCourseActiveAction : toggleCourseScoringAction;
      const r = await fn(c.id);
      if (r.status === "error") toast.error(r.error);
      else toast.success(
        field === "active"
          ? `Course ${c.isActive ? "deactivated" : "activated"}`
          : `Course marked ${c.isScoring ? "non-scoring" : "scoring"}`
      );
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    setDelLoading(true);
    const r = await deleteCourseAction(deleting.id);
    setDelLoading(false);
    setDeleting(null);
    if (r.status === "success") toast.success("Course deleted");
    else if (r.status === "error") toast.error(r.error);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description={`${courses.length} course${courses.length !== 1 ? "s" : ""}`}
        action={
          <Button variant="primary" onClick={() => setShowCreate(true)} icon={<PlusIcon />}>
            New course
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 max-w-xs">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search code, title or category…" />
        </div>
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={[
                "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
        <Select
          aria-label="Filter by course category"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value as CourseCategory | "all");
            setPage(1);
          }}
        >
          <option value="all">All categories</option>
          {COURSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {COURSE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search || filter !== "all" || categoryFilter !== "all" ? "No matching courses" : "No courses yet"}
          action={!search && filter === "all" && categoryFilter === "all" && (
            <Button variant="primary" onClick={() => setShowCreate(true)}>Create course</Button>
          )}
        />
      ) : (
        <div className="space-y-3">
          <Table>
            <Thead>
              <tr>
                <Th>Code</Th>
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Cr. hrs</Th>
                <Th>Scoring</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {paginated.map((c) => (
                <Tr key={c.id}>
                  <Td><code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">{c.code}</code></Td>
                  <Td className="font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">{c.title}</Td>
                  <Td>
                    <span className="inline-flex whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-900 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800">
                      {COURSE_CATEGORY_LABELS[c.category]}
                    </span>
                  </Td>
                  <Td className="tabular-nums font-medium">{c.creditHours}</Td>
                  <Td>
                    <button onClick={() => handleToggle(c, "scoring")}>
                      <Badge variant={c.isScoring ? "blue" : "gray"}>
                        {c.isScoring ? "Scoring" : "Non-scoring"}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <Badge variant={c.isActive ? "green" : "gray"}>
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleToggle(c, "active")}>
                        {c.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}
                        className="text-red-600 hover:bg-red-50 dark:text-red-400">
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <Pagination
            page={page} perPage={perPage} total={total} totalPages={totalPages}
            onPage={setPage} onPerPage={setPerPage}
          />
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create course"
        footer={<>
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-course-form">Create</Button>
        </>}
      >
        <form id="create-course-form" action={handleCreate} className="space-y-4">
          <Field label="Course code" required>
            <Input name="code" placeholder="MATH101" required />
          </Field>
          <Field label="Course title" required>
            <Input name="title" placeholder="Introduction to Mathematics" required />
          </Field>
          <Field label="Course category" required>
            <Select name="category" defaultValue="OSIS_NEW" required>
              {COURSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {COURSE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Credit hours" required hint="e.g. 2, 3, 6, 18, 24">
            <Input name="creditHours" type="number" min={1} defaultValue={3} required />
          </Field>
          <Field label="Scoring">
            <Select name="isScoring" defaultValue="true">
              <option value="true">Scoring (counts toward GPA)</option>
              <option value="false">Non-scoring (excluded from GPA)</option>
            </Select>
          </Field>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit course"
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-course-form">Save changes</Button>
        </>}
      >
        {editing && (
          <form id="edit-course-form" action={handleEdit} className="space-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <Field label="Course code" required>
              <Input name="code" defaultValue={editing.code} required />
            </Field>
            <Field label="Course title" required>
              <Input name="title" defaultValue={editing.title} required />
            </Field>
            <Field label="Course category" required>
              <Select name="category" defaultValue={editing.category ?? "OSIS_NEW"} required>
                {COURSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {COURSE_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Credit hours" required
              hint="Changing this affects future grade entries only. Existing grades retain their snapshot.">
              <Input name="creditHours" type="number" min={1} defaultValue={editing.creditHours} required />
            </Field>
            <Field label="Scoring">
              <Select name="isScoring" defaultValue={editing.isScoring ? "true" : "false"}>
                <option value="true">Scoring (counts toward GPA)</option>
                <option value="false">Non-scoring (excluded from GPA)</option>
              </Select>
            </Field>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete}
        title="Delete course"
        message={`Delete "${deleting?.code} — ${deleting?.title}"? This is blocked if grades exist for this course.`}
        confirmLabel="Delete" danger loading={delLoading}
      />
    </div>
  );
}

function PlusIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
}