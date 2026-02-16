"use client";

import {
  FormEvent,
  Fragment,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  SendHorizonal,
  User,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { aiApi, AiToolsMode } from "@/lib/api/ai";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  jsonValue?: unknown;
  model?: string;
};

type JsonTableProps = {
  readonly value: unknown;
  readonly path?: string;
};

const isNestedValue = (
  value: unknown,
): value is Record<string, unknown> | unknown[] =>
  typeof value === "object" && value !== null;

const getValueType = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const getEntries = (value: unknown): Array<[string, unknown]> => {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  if (isNestedValue(value)) {
    return Object.entries(value);
  }
  return [["value", value]];
};

const getPreview = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isNestedValue(value)) return `{${Object.keys(value).length}}`;
  return String(value);
};

function JsonResponseTable({ value, path = "root" }: JsonTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const entries = useMemo(() => getEntries(value), [value]);

  const toggleRow = (rowPath: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowPath]: !prev[rowPath] }));
  };

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 dark:bg-gray-800">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
              Field
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
              Type
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entryValue]) => {
            const rowPath = `${path}.${key}`;
            const expandable = isNestedValue(entryValue);
            const isExpanded = !!expandedRows[rowPath];

            return (
              <Fragment key={rowPath}>
                <tr
                  key={rowPath}
                  className="border-t border-gray-200 dark:border-gray-700"
                >
                  <td className="px-3 py-2 align-top text-gray-800 dark:text-gray-200">
                    <div className="flex items-center gap-1">
                      {expandable ? (
                        <button
                          type="button"
                          onClick={() => toggleRow(rowPath)}
                          className="rounded-sm p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700"
                          aria-label={
                            isExpanded ? "Collapse row" : "Expand row"
                          }
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block h-4 w-4" />
                      )}
                      <span className="font-medium">{key}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600 dark:text-gray-400">
                    {getValueType(entryValue)}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-800 dark:text-gray-200 break-all">
                    {getPreview(entryValue)}
                  </td>
                </tr>
                {expandable && isExpanded ? (
                  <tr
                    key={`${rowPath}.children`}
                    className="border-t border-gray-200 dark:border-gray-700"
                  >
                    <td colSpan={3} className="px-3 py-2">
                      <div className="border-l-2 border-gray-200 pl-3 dark:border-gray-700">
                        <JsonResponseTable value={entryValue} path={rowPath} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const extractJsonPayload = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
};

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const renderMarkdown = (text: string): string => {
  const rawHtml = marked.parse(text, {
    gfm: true,
    breaks: true,
  }) as string;
  return DOMPurify.sanitize(rawHtml);
};

type AiAssistantPanelProps = {
  readonly isOpen: boolean;
  readonly mode: AiToolsMode;
  readonly onClose: () => void;
};

export default function AiAssistantPanel({
  isOpen,
  mode,
  onClose,
}: AiAssistantPanelProps) {
  const t = useTranslations("common");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, sending]);

  if (!isOpen) return null;

  const submitPrompt = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || sending) return;

    setPrompt("");
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: "user",
        text: trimmed,
      },
    ]);

    setSending(true);
    try {
      const response = await aiApi.respond(trimmed);
      const assistantText = response.outputText || "";
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          text: assistantText,
          jsonValue: extractJsonPayload(assistantText),
          model: response.model,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error");

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          text: message,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  };

  return (
    <section
      className={`fixed z-30 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 ${
        isMaximized
          ? "top-20 right-4 bottom-4 left-4 lg:left-[calc(16rem+1rem)]"
          : "right-6 top-24 w-[min(680px,calc(100vw-3rem))]"
      }`}
    >
      <header className="shrink-0 flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t("aiAssistant")}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {mode === "FULL" ? t("aiModeFull") : t("aiModeReadonly")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label={isMaximized ? "Restaurar tamaño" : "Maximizar"}
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className={`overflow-y-auto px-4 py-4 space-y-4 ${
          isMaximized ? "flex-1 min-h-0" : "h-[60vh]"
        }`}
      >
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
            {t("aiAssistantPlaceholder")}
          </div>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <article
              key={message.id}
              className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser ? (
                <div className="mt-1 shrink-0 rounded-full bg-gray-100 p-2 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <Bot className="h-4 w-4" />
                </div>
              ) : null}

              <div
                className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                  isUser
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap break-words">
                    {message.text}
                  </p>
                ) : (
                  <div
                    className="break-words [&_a]:underline [&_code]:rounded [&_code]:bg-gray-200 [&_code]:px-1 [&_code]:py-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-gray-200 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 dark:[&_code]:bg-gray-700 dark:[&_pre]:bg-gray-700"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(message.text),
                    }}
                  />
                )}
                {!isUser && message.jsonValue !== undefined ? (
                  <div className="mt-3">
                    <JsonResponseTable value={message.jsonValue} />
                  </div>
                ) : null}
              </div>

              {isUser ? (
                <div className="mt-1 shrink-0 rounded-full bg-blue-600 p-2 text-white">
                  <User className="h-4 w-4" />
                </div>
              ) : null}
            </article>
          );
        })}

        {sending ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("loading")}</span>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => void submitPrompt(event)}
        className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700"
      >
        <div className="rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={onTextareaKeyDown}
            placeholder={t("aiPromptPlaceholder")}
            rows={3}
            className="w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none dark:text-gray-100"
          />
          <div className="flex justify-end px-2 py-2">
            <button
              type="submit"
              disabled={sending || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
              {t("send")}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
