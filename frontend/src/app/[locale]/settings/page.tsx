"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { Locale } from "@/config/locales";
import { useAuth } from "@/contexts/auth-context";
import { usersApi } from "@/lib/api/users";
import type { User } from "@/types/auth";

type ProfileFormState = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  language: Locale;
  avatarUrl: string;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const LANGUAGE_OPTIONS: Locale[] = ["es", "en", "pt"];

const toProfileForm = (user: User): ProfileFormState => ({
  email: user.email ?? "",
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  phone: user.phone ?? "",
  language: user.language ?? "es",
  avatarUrl: user.avatarUrl ?? "",
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SettingsPage() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const t = useTranslations("userSettings");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    language: locale,
    avatarUrl: "",
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const loadedProfileForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    if (loadedProfileForUserIdRef.current === user.id) return;
    loadedProfileForUserIdRef.current = user.id;

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const profile = await usersApi.getMyProfile();
        updateUser(profile);
        setProfileForm(toProfileForm(profile));
      } catch (error) {
        console.error("Failed to load user profile", error);
        setProfileError(t("errors.loadProfile"));
        setProfileForm(toProfileForm(user));
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile().catch((error) => {
      console.error("Failed to load user profile", error);
    });
  }, [authLoading, t, updateUser, user]);

  const avatarInitials = useMemo(() => {
    const first = profileForm.firstName.trim().charAt(0);
    const last = profileForm.lastName.trim().charAt(0);
    return `${first}${last}`.toUpperCase() || "U";
  }, [profileForm.firstName, profileForm.lastName]);

  const getPathForLocale = (nextLocale: Locale): string => {
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.replace(`/${locale}/`, `/${nextLocale}/`);
    }
    if (pathname === `/${locale}`) {
      return `/${nextLocale}`;
    }
    return `/${nextLocale}/settings`;
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const email = profileForm.email.trim();
    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();

    if (!email || !EMAIL_REGEX.test(email)) {
      setProfileError(t("errors.invalidEmail"));
      return;
    }

    if (!firstName || !lastName) {
      setProfileError(t("errors.missingName"));
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await usersApi.updateMyProfile({
        email,
        firstName,
        lastName,
        phone: profileForm.phone.trim(),
        language: profileForm.language,
        avatarUrl: profileForm.avatarUrl.trim() || null,
      });
      updateUser(updated);
      setProfileSuccess(t("messages.profileSaved"));

      if (profileForm.language !== locale) {
        globalThis.location.assign(getPathForLocale(profileForm.language));
        return;
      }
    } catch (error) {
      console.error("Failed to update profile", error);
      setProfileError(t("errors.updateProfile"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setPasswordError(t("errors.passwordRequired"));
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError(t("errors.passwordTooShort"));
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t("errors.passwordMismatch"));
      return;
    }

    setSavingPassword(true);
    try {
      await usersApi.changeMyPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess(t("messages.passwordSaved"));
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      console.error("Failed to update password", error);
      setPasswordError(t("errors.updatePassword"));
    } finally {
      setSavingPassword(false);
    }
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {tCommon("back")}
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveProfile}
          className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("profileSection")}
          </h2>

          {profileError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {profileError}
            </p>
          ) : null}
          {profileSuccess ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              {profileSuccess}
            </p>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              {tAuth("email")}
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              {tCommon("selectLanguage")}
              <select
                value={profileForm.language}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    language: event.target.value as Locale,
                  }))
                }
                className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language} value={language}>
                    {language.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              {tAuth("firstName")}
              <input
                type="text"
                value={profileForm.firstName}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    firstName: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              {tAuth("lastName")}
              <input
                type="text"
                value={profileForm.lastName}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    lastName: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              {tAuth("phone")}
              <input
                type="text"
                value={profileForm.phone}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    phone: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </label>

            <label className="text-sm text-gray-700 dark:text-gray-300">
              {t("avatarUrl")}
              <input
                type="url"
                value={profileForm.avatarUrl}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    avatarUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
                className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </label>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div
              className="h-14 w-14 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 bg-cover bg-center flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-200"
              style={
                profileForm.avatarUrl.trim()
                  ? { backgroundImage: `url(${profileForm.avatarUrl.trim()})` }
                  : undefined
              }
            >
              {profileForm.avatarUrl.trim() ? "" : avatarInitials}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("avatarHint")}
            </span>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="action-link action-link-primary disabled:opacity-60"
          >
            {savingProfile ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {savingProfile ? tCommon("saving") : tCommon("save")}
          </button>
        </form>

        <form
          onSubmit={handleChangePassword}
          className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("passwordSection")}
          </h2>

          {passwordError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {passwordError}
            </p>
          ) : null}
          {passwordSuccess ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              {passwordSuccess}
            </p>
          ) : null}

          <label className="text-sm text-gray-700 dark:text-gray-300">
            {t("currentPassword")}
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  currentPassword: event.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
          </label>

          <label className="text-sm text-gray-700 dark:text-gray-300">
            {t("newPassword")}
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  newPassword: event.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
          </label>

          <label className="text-sm text-gray-700 dark:text-gray-300">
            {tAuth("confirmPassword")}
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm((prev) => ({
                  ...prev,
                  confirmPassword: event.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border p-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
          </label>

          <button
            type="submit"
            disabled={savingPassword}
            className="action-link action-link-primary disabled:opacity-60"
          >
            {savingPassword ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Lock size={14} />
            )}
            {savingPassword ? t("changingPassword") : t("changePassword")}
          </button>
        </form>
      </div>
    </div>
  );
}
