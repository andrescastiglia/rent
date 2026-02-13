"use client";

import React, { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Currency } from "@/types/lease";
import { currenciesApi } from "@/lib/api/currencies";

interface CurrencySelectProps {
  readonly value: string;
  readonly onChange: (currency: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly id?: string;
  readonly name?: string;
}

export function CurrencySelect({
  value,
  onChange,
  disabled = false,
  className = "",
  id = "currency",
  name = "currency",
}: CurrencySelectProps) {
  const t = useTranslations("currencies");
  const locale = useLocale();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const data = await currenciesApi.getAll();
        setCurrencies(data);

        // If no value is set, use locale default
        if (!value) {
          const defaultCurrency =
            await currenciesApi.getDefaultForLocale(locale);
          onChange(defaultCurrency.code);
        }
      } catch (error) {
        console.error("Failed to load currencies:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCurrencies();
  }, [locale, value, onChange]);

  const baseClassName =
    "block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white";

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      className={`${baseClassName} ${className}`}
    >
      {loading ? (
        <option value="">{t("selectCurrency")}</option>
      ) : (
        currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.symbol} - {t(currency.code)}
          </option>
        ))
      )}
    </select>
  );
}
