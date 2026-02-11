"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

export default function UsersPage() {
  const tUsers = useTranslations("users");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const roleOptions = useMemo(
    () => ["admin", "staff", "owner", "tenant"] as const,
    [],
  );

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
    void loadUsers();
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
    setError(null);
    setSuccess(null);

    try {
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
        setSuccess(tUsers("messages.updated"));
      } else {
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
        setSuccess(tUsers("messages.created"));
      }
      closeForm();
    } catch (err) {
      console.error("Failed to save user", err);
      setError(tUsers("errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    setError(null);
    setSuccess(null);
    try {
      const updated = await usersApi.setActivation(
        user.id,
        !(user.isActive ?? true),
      );
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess(
        updated.isActive
          ? tUsers("messages.activated")
          : tUsers("messages.deactivated"),
      );
    } catch (err) {
      console.error("Failed to update activation", err);
      setError(tUsers("errors.activation"));
    }
  };

  const handleResetPassword = async (user: User) => {
    const typed = window.prompt(tUsers("newPasswordPrompt"), "");
    const explicitPassword =
      typed && typed.trim().length > 0 ? typed.trim() : undefined;

    setError(null);
    setSuccess(null);
    try {
      const result = await usersApi.resetPassword(user.id, explicitPassword);
      setSuccess(
        `${tUsers("messages.passwordReset")}: ${result.temporaryPassword}`,
      );
    } catch (err) {
      console.error("Failed to reset password", err);
      setError(tUsers("errors.resetPassword"));
    }
  };

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
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {tUsers("newUser")}
        </button>
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
        <form
          onSubmit={handleSubmit}
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
              {roleOptions.map((role) => (
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

          {!editingUser ? (
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
          ) : (
            <div className="hidden md:block" />
          )}

          <div className="md:col-span-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving
                ? tCommon("saving")
                : editingUser
                  ? tCommon("save")
                  : tCommon("create")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
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
                      onClick={() => void handleResetPassword(user)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {tUsers("resetPassword")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(user)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
                    >
                      {user.isActive ? (
                        <ShieldX className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {user.isActive
                        ? tUsers("deactivate")
                        : tUsers("activate")}
                    </button>
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
    </section>
  );
}
