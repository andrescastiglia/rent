"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import Link from "next/link";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { leasesApi } from "@/lib/api/leases";
import { paymentDocumentTemplatesApi } from "@/lib/api/payments";
import {
  emptyTemplateForm,
  isContractScope,
  parseTemplateScope,
  scopeToContractType,
  scopeToDocumentType,
  TEMPLATE_VARIABLE_GROUPS,
  TemplateScope,
} from "@/components/templates/template-scopes";

type TemplateForm = {
  name: string;
  templateBody: string;
  templateFormat: "plain_text" | "html";
  isActive: boolean;
  isDefault: boolean;
};

type TemplateEditorContentProps = {
  notFound: boolean;
  form: TemplateForm;
  scope: TemplateScope;
  variableGroups: Record<string, string[]>;
  saving: boolean;
  importingDocx: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string) => string;
  tc: (key: string) => string;
  onFormChange: React.Dispatch<React.SetStateAction<TemplateForm>>;
  onInsertVariable: (variableKey: string) => void;
  onRichCommand: (command: string) => void;
  onImportDocx: (file: File) => void;
  onSave: () => void;
};

const isNodeInsideEditor = (
  editor: HTMLDivElement,
  node: Node | null,
): boolean => node !== null && (node === editor || editor.contains(node));

const getEditorSelection = (editor: HTMLDivElement): Selection | null => {
  const selection = globalThis.getSelection();
  if (!selection) {
    return null;
  }

  if (
    selection.rangeCount === 0 ||
    !isNodeInsideEditor(editor, selection.getRangeAt(0).commonAncestorContainer)
  ) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return selection;
};

const syncEditorBody = (
  editor: HTMLDivElement | null,
  onFormChange: React.Dispatch<React.SetStateAction<TemplateForm>>,
) => {
  onFormChange((prev) => ({
    ...prev,
    templateBody: editor?.innerHTML ?? prev.templateBody,
  }));
};

const moveCaretToEnd = (selection: Selection, element: HTMLElement) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const insertTextAtCursor = (editor: HTMLDivElement, text: string) => {
  const selection = getEditorSelection(editor);
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);

  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};

const wrapSelectionWithTag = (editor: HTMLDivElement, tagName: string) => {
  const selection = getEditorSelection(editor);
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const fragment = range.extractContents();
  const wrapper = document.createElement(tagName);
  wrapper.append(fragment);
  range.insertNode(wrapper);
  moveCaretToEnd(selection, wrapper);
  return true;
};

const findCurrentBlock = (
  editor: HTMLDivElement,
  node: Node | null,
): HTMLElement | null => {
  let current: Node | null = node;
  while (current && current !== editor) {
    if (
      current instanceof HTMLElement &&
      ["P", "DIV", "H1", "H2", "H3", "BLOCKQUOTE", "LI"].includes(
        current.tagName,
      )
    ) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
};

const replaceCurrentBlockTag = (editor: HTMLDivElement, tagName: string) => {
  const selection = getEditorSelection(editor);
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const block = findCurrentBlock(
    editor,
    selection.getRangeAt(0).commonAncestorContainer,
  );
  if (!block || block.tagName.toLowerCase() === tagName) {
    return block !== null;
  }

  const replacement = document.createElement(tagName);
  replacement.innerHTML = block.innerHTML || "<br>";
  block.replaceWith(replacement);
  moveCaretToEnd(selection, replacement);
  return true;
};

const insertUnorderedList = (editor: HTMLDivElement) => {
  const selection = getEditorSelection(editor);
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const list = document.createElement("ul");
  const item = document.createElement("li");

  if (range.collapsed) {
    item.append(document.createElement("br"));
  } else {
    item.append(range.extractContents());
    if (!item.textContent?.trim() && item.children.length === 0) {
      item.append(document.createElement("br"));
    }
  }

  list.append(item);
  range.insertNode(list);
  moveCaretToEnd(selection, item);
  return true;
};

const applyRichCommand = (editor: HTMLDivElement, command: string) => {
  if (command === "bold") {
    return wrapSelectionWithTag(editor, "strong");
  }
  if (command === "italic") {
    return wrapSelectionWithTag(editor, "em");
  }
  if (command === "insertUnorderedList") {
    return insertUnorderedList(editor);
  }
  if (command.startsWith("formatBlock:")) {
    return replaceCurrentBlockTag(editor, command.split(":")[1] ?? "p");
  }
  return false;
};

function TemplateEditorContent({
  notFound,
  form,
  scope,
  variableGroups,
  saving,
  importingDocx,
  editorRef,
  t,
  tc,
  onFormChange,
  onInsertVariable,
  onRichCommand,
  onImportDocx,
  onSave,
}: Readonly<TemplateEditorContentProps>) {
  if (notFound) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("templateNotFound")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
      <input
        type="text"
        value={form.name}
        onChange={(e) =>
          onFormChange((prev) => ({ ...prev, name: e.target.value }))
        }
        placeholder={t("namePlaceholder")}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
      />

      {isContractScope(scope) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onFormChange((prev) => ({
                  ...prev,
                  templateFormat: "plain_text",
                }))
              }
              className={`rounded-full px-3 py-1 text-sm ${
                form.templateFormat === "plain_text"
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"
              }`}
            >
              Texto plano
            </button>
            <button
              type="button"
              onClick={() =>
                onFormChange((prev) => ({
                  ...prev,
                  templateFormat: "html",
                }))
              }
              className={`rounded-full px-3 py-1 text-sm ${
                form.templateFormat === "html"
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"
              }`}
            >
              Formato enriquecido
            </button>
          </div>

          <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <input
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportDocx(file);
                }
                event.currentTarget.value = "";
              }}
            />
            {importingDocx ? "Importando DOCX..." : "Cargar DOCX"}
          </label>
        </div>
      ) : null}

      {form.templateFormat === "html" && isContractScope(scope) ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRichCommand("bold")}
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
            >
              Negrita
            </button>
            <button
              type="button"
              onClick={() => onRichCommand("italic")}
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
            >
              Cursiva
            </button>
            <button
              type="button"
              onClick={() => onRichCommand("insertUnorderedList")}
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => onRichCommand("formatBlock:p")}
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
            >
              Parrafo
            </button>
          </div>

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(event) =>
              onFormChange((prev) => ({
                ...prev,
                templateBody: (event.target as HTMLDivElement).innerHTML,
              }))
            }
            className="min-h-[360px] rounded-md border border-gray-300 bg-white p-3 text-sm text-slate-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Vista previa HTML
            </p>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(form.templateBody || "<p></p>"),
              }}
            />
          </div>
        </div>
      ) : (
        <textarea
          rows={16}
          value={form.templateBody}
          onChange={(e) =>
            onFormChange((prev) => ({ ...prev, templateBody: e.target.value }))
          }
          placeholder={t("bodyPlaceholder")}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm font-mono"
        />
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-900/20 p-3">
        <div className="flex items-start gap-2 mb-2">
          <Info size={16} className="mt-0.5 text-blue-700 dark:text-blue-300" />
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              {t("variablesTitle")}
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-300">
              {t("variablesDescription")}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(variableGroups).map(([group, variables]) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase text-blue-900 dark:text-blue-200 mb-1">
                {t(`variableGroups.${group}`)}
              </p>
              <div className="flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => onInsertVariable(variable)}
                    className="text-xs font-mono px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  >
                    {`{{${variable}}}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isContractScope(scope) ? null : (
        <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="mr-2"
            checked={form.isDefault}
            onChange={(e) =>
              onFormChange((prev) => ({
                ...prev,
                isDefault: e.target.checked,
                isActive: e.target.checked ? true : prev.isActive,
              }))
            }
          />
          {t("defaultLabel")}
        </label>
      )}

      <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          className="mr-2"
          checked={form.isActive}
          onChange={(e) =>
            onFormChange((prev) => ({
              ...prev,
              isActive: e.target.checked,
              isDefault:
                !isContractScope(scope) && !e.target.checked
                  ? false
                  : prev.isDefault,
            }))
          }
        />
        {t("activeLabel")}
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? tc("saving") : tc("save")}
        </button>
      </div>
    </div>
  );
}

export default function TemplateEditorPage() {
  const t = useTranslations("templatesHub");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [scope, setScope] = useState<TemplateScope>(
    parseTemplateScope(searchParams.get("scope")),
  );
  const [templateId, setTemplateId] = useState<string | null>(
    searchParams.get("templateId"),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingDocx, setImportingDocx] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyTemplateForm);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setScope(parseTemplateScope(searchParams.get("scope")));
    setTemplateId(searchParams.get("templateId"));
  }, [searchParams]);

  useEffect(() => {
    const loadTemplate = async () => {
      if (!templateId) {
        setNotFound(false);
        setForm({ ...emptyTemplateForm });
        return;
      }

      setLoading(true);
      setNotFound(false);
      try {
        if (isContractScope(scope)) {
          const templates = await leasesApi.getTemplates(
            scopeToContractType[scope],
          );
          const target = templates.find((item) => item.id === templateId);
          if (!target) {
            setNotFound(true);
            return;
          }
          setForm({
            name: target.name,
            templateBody: target.templateBody,
            templateFormat: target.templateFormat ?? "plain_text",
            isActive: target.isActive,
            isDefault: false,
          });
          return;
        }

        const templates = await paymentDocumentTemplatesApi.list(
          scopeToDocumentType[scope],
        );
        const target = templates.find((item) => item.id === templateId);
        if (!target) {
          setNotFound(true);
          return;
        }
        setForm({
          name: target.name,
          templateBody: target.templateBody,
          templateFormat: "plain_text",
          isActive: target.isActive,
          isDefault: target.isDefault,
        });
      } catch (error) {
        console.error("Failed to load template", error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadTemplate().catch((error) => {
      console.error("Failed to load template", error);
    });
  }, [scope, templateId]);

  const variableGroups = useMemo(
    () => TEMPLATE_VARIABLE_GROUPS[scope],
    [scope],
  );

  const scopeOptions: Array<{ value: TemplateScope; label: string }> = [
    { value: "contract_rental", label: t("scopes.contractRental") },
    { value: "contract_sale", label: t("scopes.contractSale") },
    { value: "receipt", label: t("scopes.receipt") },
    { value: "invoice", label: t("scopes.invoice") },
    { value: "credit_note", label: t("scopes.creditNote") },
  ];

  const isEditing = !!templateId;

  useEffect(() => {
    if (form.templateFormat !== "html" || !editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== form.templateBody) {
      editorRef.current.innerHTML = form.templateBody || "<p></p>";
    }
  }, [form.templateBody, form.templateFormat]);

  const handleInsertVariable = (variableKey: string) => {
    const token = `{{${variableKey}}}`;
    if (form.templateFormat === "html" && editorRef.current) {
      editorRef.current.focus();
      insertTextAtCursor(editorRef.current, token);
      syncEditorBody(editorRef.current, setForm);
      return;
    }

    setForm((prev) => ({
      ...prev,
      templateBody: prev.templateBody
        ? `${prev.templateBody}\n${token}`
        : token,
    }));
  };

  const handleRichCommand = (command: string) => {
    if (!editorRef.current) return;

    editorRef.current.focus();
    applyRichCommand(editorRef.current, command);
    syncEditorBody(editorRef.current, setForm);
  };

  const handleImportDocx = async (file: File) => {
    if (!isContractScope(scope)) {
      return;
    }

    try {
      setImportingDocx(true);
      const imported = await leasesApi.importTemplateDocx(
        file,
        scopeToContractType[scope],
        form.name,
      );

      setForm((prev) => ({
        ...prev,
        name: imported.name ?? prev.name,
        templateBody: imported.templateBody ?? prev.templateBody,
        templateFormat: imported.templateFormat ?? "html",
      }));
    } catch (error) {
      console.error("Failed to import DOCX template", error);
      alert(tc("error"));
    } finally {
      setImportingDocx(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.templateBody.trim()) {
      return;
    }

    setSaving(true);
    try {
      if (isContractScope(scope)) {
        const contractType = scopeToContractType[scope];
        const normalizedBody =
          form.templateFormat === "html"
            ? DOMPurify.sanitize(form.templateBody)
            : form.templateBody;
        if (templateId) {
          await leasesApi.updateTemplate(templateId, {
            contractType,
            name: form.name.trim(),
            templateBody: normalizedBody,
            templateFormat: form.templateFormat,
            isActive: form.isActive,
          });
        } else {
          await leasesApi.createTemplate({
            contractType,
            name: form.name.trim(),
            templateBody: normalizedBody,
            templateFormat: form.templateFormat,
            isActive: form.isActive,
          });
        }
      } else {
        const type = scopeToDocumentType[scope];
        if (templateId) {
          await paymentDocumentTemplatesApi.update(templateId, {
            type,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
            isDefault: form.isDefault,
          });
        } else {
          await paymentDocumentTemplatesApi.create({
            type,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
            isDefault: form.isDefault,
          });
        }
      }

      router.push(`/${locale}/templates?scope=${scope}`);
    } catch (error) {
      console.error("Failed to save template", error);
      alert(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/templates?scope=${scope}`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToList")}
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditing ? t("editTemplate") : t("createTemplate")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("editorSubtitle")}
          </p>
        </div>
        <div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as TemplateScope)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-52">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <TemplateEditorContent
          notFound={notFound}
          form={form}
          scope={scope}
          variableGroups={variableGroups}
          saving={saving}
          importingDocx={importingDocx}
          editorRef={editorRef}
          t={t}
          tc={tc}
          onFormChange={setForm}
          onInsertVariable={handleInsertVariable}
          onRichCommand={handleRichCommand}
          onImportDocx={(file) => {
            void handleImportDocx(file);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
