"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { companySettingsApi } from "@/lib/api/company-settings";
import { useAuth } from "@/contexts/auth-context";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";
import { recoverDomainRequest } from "@/lib/domain-request";
import type { FinancialSettingsInput } from "@/lib/api/company-settings";
import { Button, FormField, StatePanel, Surface } from "@/components/ui";

export default function FinancialSettingsPanel() {
  const { user } = useAuth();
  const t = useTranslations("financialSettings");
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const mutation = useWorkflowMutation((request: FinancialSettingsInput) =>
    recoverDomainRequest(
      "/companies/current/financial-settings",
      "PATCH",
      request,
      (key) => companySettingsApi.updateFinancial(request, key),
    ),
  );
  const { busy, success } = mutation;
  const locked = busy || Boolean(mutation.pending);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    companySettingsApi
      .getFinancial()
      .then((settings) => {
        if (!cancelled) {
          setRate(
            settings.commissionTaxRate === null
              ? ""
              : String(settings.commissionTaxRate),
          );
          setSource(settings.source ?? "");
          setDate(settings.effectiveFrom ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const save = async () => {
    if (!user?.companyId || !user.id) return;
    await mutation.submit({
      commissionTaxRate: Number(rate),
      source: source.trim(),
      effectiveFrom: date,
    });
  };
  if (loading) return <StatePanel busy title={t("loading")} />;
  return (
    <Surface className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("description")}</p>
      <form
        className="space-y-4"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormField
          id="commission-tax-rate"
          label={t("rate")}
          help={t("rateHelp")}
        >
          {(attributes) => (
            <input
              {...attributes}
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              disabled={locked}
              className="ui-field"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          )}
        </FormField>
        <FormField id="commission-tax-source" label={t("source")}>
          {(attributes) => (
            <input
              {...attributes}
              className="ui-field"
              minLength={5}
              required
              disabled={locked}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          )}
        </FormField>
        <FormField id="commission-tax-date" label={t("date")}>
          {(attributes) => (
            <input
              {...attributes}
              className="ui-field"
              type="date"
              required
              disabled={locked}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </FormField>
        {error && (
          <StatePanel
            error
            title={t("error")}
            action={
              <Button
                variant="secondary"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("retry")}
              </Button>
            }
          />
        )}
        {mutation.error && <StatePanel error title={t(mutation.error)} />}
        {success && (
          <output className="block text-sm text-emerald-700 dark:text-emerald-300">
            {t("success")}
          </output>
        )}
        <Button type="submit" busy={busy}>
          {mutation.pending ? t("recover") : t("save")}
        </Button>
      </form>
    </Surface>
  );
}
