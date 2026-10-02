"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  getNavigationForUser,
  type NavigationGroup,
} from "@/config/navigation";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

interface SidebarProps {
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
}

const groups: NavigationGroup[] = [
  "home",
  "operations",
  "people",
  "administration",
];
const focusableSelector = 'a[href], button:not([disabled]), [tabindex="0"]';

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [desktop, setDesktop] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    setDesktop(media.matches);
    const change = () => setDesktop(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!isOpen || desktop || !user) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const backgrounds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-sidebar-background]"),
    );
    const inertStates = backgrounds.map((element) =>
      element.hasAttribute("inert"),
    );
    backgrounds.forEach((element) => element.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    sidebar.querySelector<HTMLElement>(focusableSelector)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>(focusableSelector),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      backgrounds.forEach((element, index) => {
        if (!inertStates[index]) element.removeAttribute("inert");
      });
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen, desktop, onClose, user]);

  if (!user) return null;
  const navItems = getNavigationForUser(user);
  const closed = !desktop && !isOpen;

  return (
    <>
      {isOpen && !desktop && (
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/40"
          tabIndex={-1}
          onClick={onClose}
          aria-label={tCommon("closeMenu")}
        />
      )}
      <aside
        id="app-sidebar"
        ref={sidebarRef}
        inert={closed}
        aria-hidden={closed || undefined}
        role={isOpen && !desktop ? "dialog" : undefined}
        aria-modal={isOpen && !desktop ? true : undefined}
        aria-label={t("groups.navigation")}
        className={`fixed inset-y-0 left-0 z-[70] flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5 lg:hidden">
          <span className="text-sm font-semibold">
            {t("groups.navigation")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost px-3"
            aria-label={tCommon("closeMenu")}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav
          className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
          aria-label={t("groups.navigation")}
        >
          {groups.map((group) => {
            const items = navItems.filter(
              (item) => (item.group ?? "operations") === group,
            );
            if (!items.length) return null;
            return (
              <section key={group} aria-label={t(`groups.${group}`)}>
                <h2 className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted">
                  {t(`groups.${group}`)}
                </h2>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const href = `/${locale}${item.href}`;
                    const active =
                      pathname === href || pathname.startsWith(`${href}/`);
                    const Icon = item.icon;
                    const className = `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-surface-muted font-semibold text-foreground border-l-4 border-brand" : "text-muted hover:bg-surface-muted hover:text-foreground"}`;
                    const content = (
                      <>
                        {Icon && (
                          <Icon
                            className="h-[18px] w-[18px] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>{t(item.labelKey)}</span>
                      </>
                    );
                    return (
                      <li key={item.href}>
                        {item.disabled ? (
                          <span
                            className={`${className} opacity-50`}
                            aria-disabled="true"
                            title={tCommon("comingSoon")}
                          >
                            {content}
                          </span>
                        ) : (
                          <Link
                            href={href}
                            className={className}
                            aria-current={active ? "page" : undefined}
                            onClick={onClose}
                          >
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
