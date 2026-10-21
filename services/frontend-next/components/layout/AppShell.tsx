'use client'

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNavGroups, useNavMatch } from "@/lib/nav";
import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
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
  // PR 018: on Beranda the header is transparent and home.webp / home.jpg runs continuously from the very top (behind the
  // header) to the bottom of the hero, measured from [data-testid=home-hero] so there is no seam between them.
  const isHome = pathname === "/";
  const homeWrapRef = useRef<HTMLDivElement>(null);
  const [homeBgH, setHomeBgH] = useState(0);
  useEffect(() => {
    if (!isHome) return;
    const wrap = homeWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const hero = wrap.querySelector('[data-testid="home-hero"]');
      if (hero) setHomeBgH(Math.round(hero.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    const mo = new MutationObserver(measure);
    mo.observe(wrap, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [isHome]);

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
      <div ref={homeWrapRef} className={isHome ? "relative isolate flex flex-1 flex-col" : "contents"}>
        {isHome ? (
          <>
            <div aria-hidden data-testid="home-bg" className="pointer-events-none absolute inset-x-0 top-0 -z-10 bg-white bg-cover bg-no-repeat bg-[position:right_top]" style={{ height: homeBgH || "100vh", backgroundImage: `url(${PUBLIC_BASE_PATH}/home.webp), url(${PUBLIC_BASE_PATH}/home.jpg)` }} />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 bg-gradient-to-r from-white/90 via-white/50 to-transparent lg:from-white/70 lg:via-white/20" style={{ height: homeBgH || "100vh" }} />
          </>
        ) : null}
        <div className="print:hidden">
          <DashboardHeader
            authenticated={authenticated}
            consoleMode={consoleMode}
            transparent={isHome}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          />
        </div>
        <div className={`w-full flex-1 ${isDirectoryPage ? 'py-0' : 'pb-3 md:pb-5'}`}>
          {/* PR 018: no breadcrumb on Dasbor Utama (section quick-nav instead) */}
          {pathname === "/main-dashboard" ? null : <div className="print:hidden"><Breadcrumbs match={match} /></div>}
          <div className={isHome ? "" : "pt-3 md:pt-4"}>{children}</div>
        </div>
      </div>
      <div className="print:hidden">
        <Footer />
      </div>
    </main>
  );
}
