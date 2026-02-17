"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useLocale, useTranslations } from "next-intl";
import { TurnstileCaptcha } from "@/components/common/TurnstileCaptcha";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loginFailures, setLoginFailures] = useState(0);
  const [forceCaptcha, setForceCaptcha] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth");
  const locale = useLocale();
  const requiresCaptcha = forceCaptcha || loginFailures >= 1;

  const getErrorMessage = (error: unknown): string => {
    if (!(error instanceof Error)) return t("errors.loginError");
    if (error.message === "user.blocked") {
      return t("errors.blocked");
    }
    if (error.message === "Invalid credentials") {
      return t("errors.invalidCredentials");
    }
    if (error.message === "CAPTCHA_REQUIRED") {
      return t("errors.captchaRequired");
    }
    if (error.message === "CAPTCHA_INVALID") {
      return t("errors.captchaInvalid");
    }
    if (error.message === "CAPTCHA_NOT_CONFIGURED") {
      return t("errors.captchaUnavailable");
    }
    return error.message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (requiresCaptcha && !captchaToken) {
      setError(t("errors.captchaRequired"));
      return;
    }

    setLoading(true);

    try {
      await login({ email, password, captchaToken: captchaToken ?? undefined });
      setLoginFailures(0);
      setForceCaptcha(false);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "Invalid credentials") {
        setLoginFailures((prev) => prev + 1);
      }
      if (error instanceof Error && error.message === "CAPTCHA_REQUIRED") {
        setForceCaptcha(true);
      }
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("login")}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {t("systemTitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-sm">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-xs focus:outline-hidden focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder={t("placeholders.email")}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("password")}
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-xs focus:outline-hidden focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder={t("placeholders.password")}
          />
        </div>

        {requiresCaptcha && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("captcha")}
            </p>
            <TurnstileCaptcha onTokenChange={setCaptchaToken} />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t("loggingIn") : t("login")}
        </button>

        <div className="text-center text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {t("noAccount")}{" "}
          </span>
          <Link
            href={`/${locale}/register`}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            {t("register")}
          </Link>
        </div>
      </form>
    </div>
  );
}
