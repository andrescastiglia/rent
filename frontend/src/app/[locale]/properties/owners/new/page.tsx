"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { OwnerForm } from "@/components/owners/OwnerForm";

export default function CreateOwnerPage() {
  const t = useTranslations("properties");
  const locale = useLocale();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/properties`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToList")}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          {t("createOwnerTitle")}
        </h1>
        <OwnerForm />
      </div>
    </div>
  );
}
