'use client'

import { tr } from "@/lib/i18n/LanguageContext";
import {
  LayoutDashboard,
  Menu,
  Settings as SettingsIcon,
  Users as UsersIcon,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSettings } from "@/lib/settings-context";

export default function DashboardHeader({
  onToggleSidebar,
  authenticated = true,
  consoleMode = false,
}: {
  onToggleSidebar: () => void;
  authenticated?: boolean;
  consoleMode?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { settings } = useSettings();

  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/Logo-Kemenkes.png`;
  

  const appTitle = consoleMode
    ? tr("skdr.layout.console")
    : (settings.app_name || tr("skdr.layout.appName"));
    
  const appSubtitle = consoleMode
    ? tr("skdr.layout.consoleSub")
    : (settings.app_tagline || tr("skdr.layout.appTagline"));

  return (
    <header className="w-full border-b border-white/20 bg-[#102f78]">
      <div className="relative flex min-h-[118px] items-stretch overflow-visible bg-[#102f78]">
        {/* PR 014: neutral SKDR/Kemenkes gradient (old NLP header image removed) */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900 via-primary to-brand-500" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/25 via-transparent to-black/10" />
        <div className="relative grid w-full gap-5 px-4 py-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              data-testid="nav-toggle"
              onClick={onToggleSidebar}
              aria-label={t("header.openMenu")}
              className="inline-flex h-11 w-11 shrink-0 lg:hidden items-center justify-center rounded-xl border border-white/50 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              href={consoleMode ? "/console/settings" : "/"}
              className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt={tr("skdr.layout.logo")}
                className="h-auto max-h-[62px] w-[132px] shrink-0 object-contain md:w-[168px]"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="min-w-0 border-white/35 md:border-l md:pl-5">
                <div className="flex items-center gap-2">
                  <h1 className="max-w-[720px] text-lg font-extrabold uppercase leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:text-2xl md:text-3xl">
                    {appTitle}
                  </h1>
                  {consoleMode && (
                    <span className="hidden items-center rounded-md border border-white/30 bg-white/15 px-2 py-0.5 text-xs font-bold text-white sm:inline-flex">
                      ADMIN CONSOLE
                    </span>
                  )}
                </div>
                <p className="mt-2 hidden max-w-[760px] text-xs leading-relaxed text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] sm:block md:text-sm lg:text-base">
                  {appSubtitle}
                </p>
              </div>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <LanguageSwitcher />

            {/* In Console Mode: Show Console Tabs (Settings, Users, Configuration Modul) + Button to return to Surveillance Dashboard */}
            {consoleMode ? (
              <div className="hidden items-center rounded-2xl border border-white/45 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm sm:flex">
                <Link
                  href="/console/settings"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/console/settings")
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "text-slate-700 hover:bg-white hover:text-primary"
                  }`}
                >
                  <SettingsIcon className="h-4 w-4" />
                  {tr("skdr.layout.settings")}
                </Link>
                <Link
                  href="/console/configuration-modul"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/console/configuration-modul")
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "text-slate-700 hover:bg-white hover:text-primary"
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {tr("skdr.layout.modules")}
                </Link>
                <Link
                  href="/console/users"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/console/users")
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "text-slate-700 hover:bg-white hover:text-primary"
                  }`}
                >
                  <UsersIcon className="h-4 w-4" />
                  {tr("skdr.layout.users")}
                </Link>
                <Link
                  href="/reports/drafts"
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/reports/drafts") || pathname?.startsWith("/reports/new") || pathname?.startsWith("/reports/edit")
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "text-slate-700 hover:bg-white hover:text-primary"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  {tr("skdr.layout.reports")}
                </Link>
                <Link
                  href="/main-dashboard"
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-primary"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {tr("skdr.layout.dashboardLink")}
                </Link>
              </div>
            ) : null}

            {/* SKDR: no login/logout yet; NLP user menu removed. */}
          </div>
        </div>
      </div>
    </header>
  );
}
