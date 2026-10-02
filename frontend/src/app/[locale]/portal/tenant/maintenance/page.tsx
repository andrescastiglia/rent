"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { leasesApi } from "@/lib/api/leases";
import { maintenanceApi } from "@/lib/api/maintenance";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";
import { propertiesApi } from "@/lib/api/properties";
import { useAuth } from "@/contexts/auth-context";
import { hasUserRole } from "@/lib/permissions";
import {
  MaintenanceTicketArea,
  MaintenanceTicketPriority,
  MaintenanceTicketSource,
  type MaintenanceTicket,
} from "@/types/maintenance";
import {
  Button,
  FormField,
  PageHeader,
  StatePanel,
  Surface,
} from "@/components/ui";
import MaintenanceAttachments from "@/components/documents/MaintenanceAttachments";
import TicketConversation from "@/components/maintenance/TicketConversation";
export default function TenantMaintenancePage() {
  const t = useTranslations("tenantMaintenance"),
    tm = useTranslations("maintenance"),
    locale = useLocale();
  const { user } = useAuth();
  const owner = hasUserRole(user, "owner");
  const [properties, setProperties] = useState<
      Array<{ id: string; name: string }>
    >([]),
    [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const [propertyId, setPropertyId] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  const [area, setArea] = useState(MaintenanceTicketArea.OTHER),
    [priority, setPriority] = useState(MaintenanceTicketPriority.MEDIUM);
  const [selected, setSelected] = useState<MaintenanceTicket>();
  const mutation = useWorkflowMutation(maintenanceApi.create);
  const locked = mutation.busy || Boolean(mutation.pending);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      owner
        ? propertiesApi
            .getAll()
            .then((items) =>
              items.map((item) => ({ id: item.id, name: item.name })),
            )
        : leasesApi.getAll({ status: "ACTIVE" }).then((items) =>
            items.map((item) => ({
              id: item.propertyId,
              name: item.property?.name || item.propertyId,
            })),
          ),
      maintenanceApi.getAll(),
    ])
      .then(([contracts, requests]) => {
        if (cancelled) return;
        setProperties(contracts);
        setTickets(requests);
        setPropertyId((previous) => previous || contracts[0]?.id || "");
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
  }, [revision, owner]);
  async function submit() {
    const success = await mutation.submit({
      propertyId,
      title: title.trim(),
      description: description.trim(),
      area,
      priority,
      source: owner
        ? MaintenanceTicketSource.OWNER
        : MaintenanceTicketSource.TENANT,
    });
    if (success) setRevision((value) => value + 1);
  }
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("description")} />
      {loading && <StatePanel busy title={t("loading")} />}
      {error && (
        <StatePanel
          error
          title={t("readError")}
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
      {!loading && !error && (
        <>
          <Surface className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">{t("newRequest")}</h2>
            {properties.length === 0 ? (
              <StatePanel title={t("noLease")} />
            ) : (
              <form
                className="space-y-4"
                aria-busy={mutation.busy}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <FormField
                  id="tenant-maintenance-property"
                  label={tm("property")}
                >
                  {(attributes) => (
                    <select
                      {...attributes}
                      className="ui-field"
                      required
                      disabled={locked}
                      value={propertyId}
                      onChange={(event) => {
                        setPropertyId(event.target.value);
                        mutation.reset();
                      }}
                    >
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField id="tenant-maintenance-title" label={tm("title")}>
                  {(attributes) => (
                    <input
                      {...attributes}
                      className="ui-field"
                      required
                      disabled={locked}
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        mutation.reset();
                      }}
                    />
                  )}
                </FormField>
                <FormField
                  id="tenant-maintenance-description"
                  label={tm("description")}
                >
                  {(attributes) => (
                    <textarea
                      {...attributes}
                      className="ui-field min-h-24"
                      disabled={locked}
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        mutation.reset();
                      }}
                    />
                  )}
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="tenant-maintenance-area" label={tm("area")}>
                    {(attributes) => (
                      <select
                        {...attributes}
                        className="ui-field"
                        disabled={locked}
                        value={area}
                        onChange={(event) =>
                          setArea(event.target.value as MaintenanceTicketArea)
                        }
                      >
                        {Object.values(MaintenanceTicketArea).map((value) => (
                          <option key={value} value={value}>
                            {tm(`areas.${value}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                  <FormField
                    id="tenant-maintenance-priority"
                    label={tm("priority")}
                  >
                    {(attributes) => (
                      <select
                        {...attributes}
                        className="ui-field"
                        disabled={locked}
                        value={priority}
                        onChange={(event) =>
                          setPriority(
                            event.target.value as MaintenanceTicketPriority,
                          )
                        }
                      >
                        {Object.values(MaintenanceTicketPriority).map(
                          (value) => (
                            <option key={value} value={value}>
                              {tm(`priorities.${value}`)}
                            </option>
                          ),
                        )}
                      </select>
                    )}
                  </FormField>
                </div>
                <Button
                  type="submit"
                  busy={mutation.busy}
                  disabled={!title.trim() || !propertyId || mutation.success}
                >
                  {t(mutation.pending ? "recover" : "submit")}
                </Button>
              </form>
            )}
            {mutation.error && <StatePanel error title={t(mutation.error)} />}
            {mutation.success && (
              <output className="block text-sm">{t("success")}</output>
            )}
          </Surface>
          <Surface className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">{t("requests")}</h2>
            {tickets.length === 0 && (
              <p className="text-sm text-muted">{t("empty")}</p>
            )}
            <ul className="divide-y divide-line">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{ticket.title}</p>
                    <p className="text-xs text-muted">
                      {new Date(ticket.createdAt).toLocaleDateString(locale)} ·{" "}
                      {tm(`statuses.${ticket.status}`)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setSelected(ticket)}
                  >
                    {t("open")}
                  </Button>
                </li>
              ))}
            </ul>
          </Surface>
          {selected && (
            <Surface className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="break-words text-lg font-semibold">
                  {selected.title}
                </h2>
                <Button variant="ghost" onClick={() => setSelected(undefined)}>
                  {t("close")}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm">
                {selected.description}
              </p>
              {selected.resolutionNotes && (
                <p className="text-sm">{selected.resolutionNotes}</p>
              )}
              <TicketConversation key={selected.id} ticketId={selected.id} />
              <MaintenanceAttachments
                key={selected.id}
                ticketId={selected.id}
              />
            </Surface>
          )}
        </>
      )}
    </div>
  );
}
