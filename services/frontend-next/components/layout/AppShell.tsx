'use client'

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useNavGroups, useNavMatch } from "@/lib/nav";
import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import Breadcrumbs from "./Breadcrumbs";
import Footer from "./Footer";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function AppShell({
  children,
  publicMode = false,
  tvMode = false,
  consoleMode = false,
}: {
  children: React.ReactNode;
  publicMode?: boolean;
  tvMode?: boolean;
  consoleMode?: boolean;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // PR 017: desktop sidebar collapsible to icon-only; preference kept in localStorage
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(window.localStorage.getItem("skdr_sidebar_collapsed") === "1"); }, []);
  const toggleCollapse = () => setCollapsed((c) => { window.localStorage.setItem("skdr_sidebar_collapsed", c ? "0" : "1"); return !c; });
  const authenticated = true; // SKDR: no auth
  const isDirectoryPage = false;

  // Close sidebar drawer automatically on page/route navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // PR 017: grouped navigation from app_settings.navigation_menu (+ Form PE sub-items from the PE form registry)
  const navGroups = useNavGroups();
  const match = useNavMatch(navGroups);

  if (tvMode)
    return (
      <main className="min-h-screen bg-slate-950 text-white">{children}</main>
    );

  return (
    <main className={`flex min-h-screen flex-col bg-[#f8fafc] text-slate-900 transition-[padding] duration-300 print:pl-0 ${collapsed ? "lg:pl-[72px]" : "lg:pl-[280px]"}`}>
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("common.closeSidebar")}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-[55] bg-slate-900/35 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <div className="print:hidden">
        <DashboardSidebar
          open={sidebarOpen}
          menuGroups={navGroups}
          match={match}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      <div className="print:hidden">
        <DashboardHeader
          authenticated={authenticated}
          consoleMode={consoleMode}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
      </div>
      <div className={`w-full flex-1 ${isDirectoryPage ? 'py-0' : 'pb-3 md:pb-5'}`}>
        <div className="print:hidden"><Breadcrumbs match={match} /></div>
        <div className="pt-3 md:pt-4">{children}</div>
      </div>
      <div className="print:hidden">
        <Footer />
      </div>
    </main>
  );
}
