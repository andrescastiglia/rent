"use client";

import { SyntheticEvent, useCallback, useEffect, useState } from "react";
import { staffApi } from "@/lib/api/staff";
import type {
  Staff,
  StaffSpecialization,
  CreateStaffInput,
} from "@/types/staff";
import { useTranslations } from "next-intl";
import { Loader2, Plus, ShieldCheck, ShieldX, UserPen } from "lucide-react";
import { RoleGuard } from "@/components/common/RoleGuard";
import { useAuth } from "@/contexts/auth-context";

const SPECIALIZATIONS: StaffSpecialization[] = [
  "maintenance",
  "cleaning",
  "security",
  "administration",
  "accounting",
  "legal",
  "other",
];

const SPECIALIZATION_COLORS: Record<StaffSpecialization, string> = {
  maintenance: "bg-yellow-100 text-yellow-800",
  cleaning: "bg-blue-100 text-blue-800",
  security: "bg-red-100 text-red-800",
  administration: "bg-purple-100 text-purple-800",
  accounting: "bg-green-100 text-green-800",
  legal: "bg-indigo-100 text-indigo-800",
  other: "bg-gray-100 text-gray-800",
};

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: StaffSpecialization;
  hourlyRate: string;
  currency: string;
  notes: string;
};

const INITIAL_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  specialization: "maintenance",
  hourlyRate: "",
  currency: "USD",
  notes: "",
};

function staffToForm(staff: Staff): FormState {
  return {
    firstName: staff.user.firstName ?? "",
    lastName: staff.user.lastName ?? "",
    email: staff.user.email ?? "",
    phone: staff.user.phone ?? "",
    specialization: staff.specialization,
    hourlyRate: staff.hourlyRate == null ? "" : String(staff.hourlyRate),
    currency: staff.currency,
    notes: staff.notes ?? "",
  };
}

function StaffFormPanel({
  form,
  setForm,
  editingStaff,
  saving,
  onSubmit,
  onClose,
}: Readonly<{
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingStaff: Staff | null;
  saving: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClose: () => void;
}>) {
  const tStaff = useTranslations("staff");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  let submitLabel = tCommon("create");
  if (saving) {
    submitLabel = tCommon("saving");
  } else if (editingStaff) {
    submitLabel = tCommon("save");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <label className="text-sm text-gray-700 dark:text-gray-300">
        {tAuth("firstName")}
        <input
          required
          type="text"
          value={form.firstName}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, firstName: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {tAuth("lastName")}
        <input
          required
          type="text"
          value={form.lastName}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, lastName: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {tAuth("email")}
        <input
          type="email"
          value={form.email}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, email: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {tAuth("phone")}
        <input
          type="tel"
          value={form.phone}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, phone: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {tStaff("specialization")}
        <select
          required
          value={form.specialization}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              specialization: e.target.value as StaffSpecialization,
            }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {SPECIALIZATIONS.map((spec) => (
            <option key={spec} value={spec}>
              {tStaff(`specializations.${spec}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
          {tStaff("hourlyRate")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.hourlyRate}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, hourlyRate: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>
        <label className="w-24 text-sm text-gray-700 dark:text-gray-300">
          {tStaff("currency")}
          <input
            aria-label={tStaff("currency")}
            type="text"
            value={form.currency}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, currency: e.target.value }))
            }
            maxLength={3}
            placeholder="USD"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>
      </div>

      <label className="text-sm text-gray-700 md:col-span-2 dark:text-gray-300">
        {tStaff("notes")}
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <div className="flex gap-2 md:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {tCommon("cancel")}
        </button>
      </div>
    </form>
  );
}

function StaffList({
  staff,
  renderActions,
}: Readonly<{
  staff: Staff[];
  renderActions: (s: Staff) => React.ReactNode;
}>) {
  const tStaff = useTranslations("staff");

  if (staff.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {tStaff("noStaff")}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {tStaff("noStaffDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {(
              [
                ["name", tStaff("title")],
                ["specialization", tStaff("specialization")],
                ["hourlyRate", tStaff("hourlyRate")],
                ["totalJobs", tStaff("totalJobs")],
                ["status", tStaff("active")],
                ["actions", ""],
              ] as [string, string][]
            ).map(([col, label]) => (
              <th
                key={col}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {staff.map((s) => {
            const isActive = s.user.isActive !== false && !s.deletedAt;
            return (
              <tr key={s.id} className={isActive ? "" : "opacity-60"}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {[s.user.firstName, s.user.lastName]
                    .filter(Boolean)
                    .join(" ") || "—"}
                  {s.user.email ? (
                    <p className="text-xs text-gray-400">{s.user.email}</p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SPECIALIZATION_COLORS[s.specialization]}`}
                  >
                    {tStaff(`specializations.${s.specialization}`)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {s.hourlyRate == null ? "—" : `${s.hourlyRate} ${s.currency}`}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {s.totalJobs}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {isActive ? tStaff("active") : tStaff("inactive")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    {renderActions(s)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StaffPage() {
  const tStaff = useTranslations("staff");
  const tCommon = useTranslations("common");
  const { user } = useAuth();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [filterSpec, setFilterSpec] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await staffApi.getAll({
        specialization: filterSpec || undefined,
        search: filterSearch || undefined,
      });
      setStaffList(data);
    } catch (err) {
      console.error("Failed to load staff", err);
      setError(tStaff("errors.load"));
    } finally {
      setLoading(false);
    }
  }, [filterSpec, filterSearch, tStaff]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const openCreate = () => {
    clearMessages();
    setEditingStaff(null);
    setForm(INITIAL_FORM);
    setShowForm(true);
  };

  const openEdit = (s: Staff) => {
    clearMessages();
    setEditingStaff(s);
    setForm(staffToForm(s));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingStaff(null);
    setForm(INITIAL_FORM);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    clearMessages();

    const input: CreateStaffInput = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || undefined,
      phone: form.phone || undefined,
      specialization: form.specialization,
      hourlyRate: form.hourlyRate
        ? Number.parseFloat(form.hourlyRate)
        : undefined,
      currency: form.currency || "USD",
      notes: form.notes || undefined,
    };

    try {
      if (editingStaff) {
        const updated = await staffApi.update(editingStaff.id, input);
        setStaffList((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        );
        setSuccess(tStaff("messages.updated"));
      } else {
        const created = await staffApi.create(input);
        setStaffList((prev) => [created, ...prev]);
        setSuccess(tStaff("messages.created"));
      }
      closeForm();
    } catch (err) {
      console.error("Failed to save staff", err);
      setError(tStaff("errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: Staff) => {
    clearMessages();
    const isCurrentlyActive = s.user.isActive !== false && !s.deletedAt;
    try {
      if (isCurrentlyActive) {
        await staffApi.remove(s.id);
        setStaffList((prev) =>
          prev.map((item) =>
            item.id === s.id
              ? {
                  ...item,
                  deletedAt: new Date().toISOString(),
                  user: { ...item.user, isActive: false },
                }
              : item,
          ),
        );
        setSuccess(tStaff("messages.deactivated"));
      } else {
        const activated = await staffApi.activate(s.id);
        setStaffList((prev) =>
          prev.map((item) => (item.id === activated.id ? activated : item)),
        );
        setSuccess(tStaff("messages.activated"));
      }
    } catch (err) {
      console.error("Failed to toggle staff activation", err);
      setError(tStaff("errors.activation"));
    }
  };

  const renderActions = (s: Staff) => {
    const isActive = s.user.isActive !== false && !s.deletedAt;
    return (
      <>
        {isAdmin && (
          <button
            type="button"
            onClick={() => openEdit(s)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <UserPen className="h-3.5 w-3.5" />
            {tCommon("edit")}
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              handleToggleActive(s).catch(console.error);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {isActive ? (
              <ShieldX className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {isActive ? tStaff("deactivate") : tStaff("activate")}
          </button>
        )}
      </>
    );
  };

  return (
    <RoleGuard allowedRoles={["admin", "staff"]}>
      <section className="space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {tStaff("title")}
          </h1>
          {isAdmin && !showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {tStaff("newStaff")}
            </button>
          )}
        </header>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </p>
        ) : null}

        {showForm ? (
          <StaffFormPanel
            form={form}
            setForm={setForm}
            editingStaff={editingStaff}
            saving={saving}
            onSubmit={handleSubmit}
            onClose={closeForm}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={filterSpec}
              onChange={(e) => setFilterSpec(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{tStaff("specialization")}</option>
              {SPECIALIZATIONS.map((spec) => (
                <option key={spec} value={spec}>
                  {tStaff(`specializations.${spec}`)}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder={tCommon("search")}
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          !showForm && (
            <StaffList staff={staffList} renderActions={renderActions} />
          )
        )}
      </section>
    </RoleGuard>
  );
}
