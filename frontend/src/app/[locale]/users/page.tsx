"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  usersApi,
  type CreateManagedUserInput,
  type UpdateManagedUserInput,
} from "@/lib/api/users";
import type { User } from "@/types/auth";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  UserPen,
} from "lucide-react";

type FormState = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: User["role"];
  password: string;
};

const INITIAL_FORM: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  role: "owner",
  password: "",
};

async function submitUserForm(
  editingUser: User | null,
  form: FormState,
  setUsers: React.Dispatch<React.SetStateAction<User[]>>,
): Promise<"updated" | "created"> {
  if (editingUser) {
    const payload: UpdateManagedUserInput = {
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      role: form.role,
    };
    const updated = await usersApi.update(editingUser.id, payload);
    setUsers((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    );
    return "updated";
  }

  const payload: CreateManagedUserInput = {
    email: form.email,
    password: form.password,
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone || undefined,
    role: form.role,
  };
  const created = await usersApi.create(payload);
  setUsers((prev) => [created, ...prev]);
  return "created";
}

async function toggleUserActivation(
  user: User,
  setUsers: React.Dispatch<React.SetStateAction<User[]>>,
): Promise<boolean> {
  const nextIsActive = !(user.isActive ?? true);
  const updated = await usersApi.setActivation(user.id, nextIsActive);
  setUsers((prev) =>
    prev.map((item) => (item.id === updated.id ? updated : item)),
  );
  return updated.isActive ?? nextIsActive;
}

async function submitResetPassword(
  userId: string,
  password: string,
): Promise<string> {
  const result = await usersApi.resetPassword(userId, password);
  return result.temporaryPassword;
}

function resetUsersPageMessages(
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setSuccess: React.Dispatch<React.SetStateAction<string | null>>,
) {
  setError(null);
  setSuccess(null);
}

const ROLE_OPTIONS = ["admin", "staff", "owner", "tenant"] as const;

function UserFormPanel({
  form,
  setForm,
  editingUser,
  saving,
  onSubmit,
  onClose,
}: Readonly<{
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingUser: User | null;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}>) {
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  let submitLabel = tCommon("create");
  if (saving) {
    submitLabel = tCommon("saving");
  } else if (editingUser) {
    submitLabel = tCommon("save");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-2"
    >
      <label className="text-sm text-gray-700">
        {tAuth("email")}
        <input
          required
          type="email"
          value={form.email}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, email: event.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="text-sm text-gray-700">
        {tAuth("role")}
        <select
          value={form.role}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              role: event.target.value as User["role"],
            }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-gray-700">
        {tAuth("firstName")}
        <input
          required
          type="text"
          value={form.firstName}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, firstName: event.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="text-sm text-gray-700">
        {tAuth("lastName")}
        <input
          required
          type="text"
          value={form.lastName}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, lastName: event.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="text-sm text-gray-700">
        {tAuth("phone")}
        <input
          type="text"
          value={form.phone}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, phone: event.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      {editingUser ? (
        <div className="hidden md:block" />
      ) : (
        <label className="text-sm text-gray-700">
          {tAuth("password")}
          <input
            required
            minLength={8}
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
      )}

      <div className="md:col-span-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {tCommon("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function UserList({
  users,
  renderUserActions,
}: Readonly<{
  users: User[];
  renderUserActions: (user: User) => React.ReactNode;
}>) {
  const tAuth = useTranslations("auth");
  const tUsers = useTranslations("users");
  const tCommon = useTranslations("common");

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="divide-y divide-gray-100 md:hidden">
        {users.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            {tUsers("noUsers")}
          </p>
        ) : (
          users.map((user) => (
            <article key={user.id} className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900 break-all">
                  {user.email}
                </p>
                <p className="text-xs text-gray-500">
                  {user.firstName} {user.lastName}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-gray-500">{tAuth("role")}</p>
                  <p className="text-gray-700">{user.role}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500">
                    {tUsers("status")}
                  </p>
                  <p className="text-gray-700">
                    {user.isActive ? tUsers("active") : tUsers("inactive")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {renderUserActions(user)}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[760px] w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                {tAuth("email")}
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                {tAuth("firstName")}
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                {tAuth("lastName")}
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                {tAuth("role")}
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                {tUsers("status")}
              </th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                {tCommon("actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2 text-gray-700">{user.email}</td>
                <td className="px-4 py-2 text-gray-700">{user.firstName}</td>
                <td className="px-4 py-2 text-gray-700">{user.lastName}</td>
                <td className="px-4 py-2 text-gray-700">{user.role}</td>
                <td className="px-4 py-2 text-gray-700">
                  {user.isActive ? tUsers("active") : tUsers("inactive")}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {renderUserActions(user)}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={6}>
                  {tUsers("noUsers")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSubmit,
  value,
  setValue,
  error,
  setError,
  submitting,
}: Readonly<{
  user: User;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
  setValue: (value: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  submitting: boolean;
}>) {
  const tAuth = useTranslations("auth");
  const tUsers = useTranslations("users");
  const tCommon = useTranslations("common");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label={tCommon("close")}
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {tUsers("resetPasswordDialog.title")}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {tUsers("resetPasswordDialog.subtitle", {
              name: `${user.firstName} ${user.lastName}`.trim(),
            })}
          </p>
        </div>

        <div className="space-y-2 p-4">
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            {tAuth("password")}
          </label>
          <input
            required
            minLength={8}
            autoFocus
            type="password"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tUsers("resetPasswordDialog.hint")}
          </p>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? tCommon("saving") : tCommon("confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const tUsers = useTranslations("users");
  const tCommon = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const isEditing = showForm && editingUser !== null;
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(
    null,
  );
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await usersApi.list(1, 100);
      setUsers(result.data);
    } catch (err) {
      console.error("Failed to load users", err);
      setError(tUsers("errors.load"));
    } finally {
      setLoading(false);
    }
  }, [tUsers]);

  useEffect(() => {
    loadUsers().catch((error) => {
      console.error("Failed to load users", error);
    });
  }, [loadUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(INITIAL_FORM);
    setError(null);
    setSuccess(null);
    setShowForm(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? "",
      role: user.role,
      password: "",
    });
    setError(null);
    setSuccess(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setForm(INITIAL_FORM);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    resetUsersPageMessages(setError, setSuccess);

    try {
      const action = await submitUserForm(editingUser, form, setUsers);
      setSuccess(
        action === "updated"
          ? tUsers("messages.updated")
          : tUsers("messages.created"),
      );
      closeForm();
    } catch (err) {
      console.error("Failed to save user", err);
      setError(tUsers("errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    resetUsersPageMessages(setError, setSuccess);
    try {
      const isActive = await toggleUserActivation(user, setUsers);
      setSuccess(
        isActive
          ? tUsers("messages.activated")
          : tUsers("messages.deactivated"),
      );
    } catch (err) {
      console.error("Failed to update activation", err);
      setError(tUsers("errors.activation"));
    }
  };

  const handleToggleActiveClick = (user: User) => {
    handleToggleActive(user).catch((error) => {
      console.error("Failed to update activation", error);
    });
  };

  const openResetPasswordDialog = (user: User) => {
    setResetPasswordUser(user);
    setResetPasswordValue("");
    setResetPasswordError(null);
    resetUsersPageMessages(setError, setSuccess);
  };

  const closeResetPasswordDialog = () => {
    if (resettingPassword) return;
    setResetPasswordUser(null);
    setResetPasswordValue("");
    setResetPasswordError(null);
  };

  const handleResetPasswordSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!resetPasswordUser) return;

    const normalizedPassword = resetPasswordValue.trim();
    if (normalizedPassword.length < 8) {
      setResetPasswordError(tUsers("errors.passwordMinLength"));
      return;
    }

    setResettingPassword(true);
    setResetPasswordError(null);
    resetUsersPageMessages(setError, setSuccess);
    try {
      const temporaryPassword = await submitResetPassword(
        resetPasswordUser.id,
        normalizedPassword,
      );
      setSuccess(`${tUsers("messages.passwordReset")}: ${temporaryPassword}`);
      setResetPasswordUser(null);
      setResetPasswordValue("");
    } catch (err) {
      console.error("Failed to reset password", err);
      setError(tUsers("errors.resetPassword"));
    } finally {
      setResettingPassword(false);
    }
  };

  const renderUserActions = (user: User) => (
    <>
      <button
        type="button"
        onClick={() => openEdit(user)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
      >
        <UserPen className="h-3.5 w-3.5" />
        {tCommon("edit")}
      </button>
      <button
        type="button"
        onClick={() => openResetPasswordDialog(user)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {tUsers("resetPassword")}
      </button>
      <button
        type="button"
        onClick={() => handleToggleActiveClick(user)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
      >
        {user.isActive ? (
          <ShieldX className="h-3.5 w-3.5" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        {user.isActive ? tUsers("deactivate") : tUsers("activate")}
      </button>
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {tUsers("title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tUsers("subtitle")}
          </p>
        </div>
        {isEditing ? null : (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {tUsers("newUser")}
          </button>
        )}
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      {showForm ? (
        <UserFormPanel
          form={form}
          setForm={setForm}
          editingUser={editingUser}
          saving={saving}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      ) : null}

      {isEditing ? null : (
        <UserList users={users} renderUserActions={renderUserActions} />
      )}

      {resetPasswordUser ? (
        <ResetPasswordDialog
          user={resetPasswordUser}
          onClose={closeResetPasswordDialog}
          onSubmit={handleResetPasswordSubmit}
          value={resetPasswordValue}
          setValue={setResetPasswordValue}
          error={resetPasswordError}
          setError={setResetPasswordError}
          submitting={resettingPassword}
        />
      ) : null}
    </section>
  );
}
