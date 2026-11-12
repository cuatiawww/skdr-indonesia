'use client'

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNavGroups, useNavMatch } from "@/lib/nav";
import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import Breadcrumbs from "./Breadcrumbs";
import Footer from "./Footer";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useAuth } from "@/lib/skdr-auth";
import { hasPerm, routeArea } from "@/lib/access";

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
  // PR 029: login state from AuthProvider (HttpOnly session cookie)
  const { user } = useAuth();
  const authenticated = !!user;
  const isDirectoryPage = false;
  const isHome = pathname === "/" || pathname === "/beranda";
  // PR 027: Dasbor Zoonosis Lite has its own header title/subtitle (the page body carries no title).
  const isLite = pathname === "/dasbor/zoonosis-lite";
  // PR 050: Mode TV (/tv) is a full-viewport spatial epidemiological command center (no breadcrumbs/footer/padding).
  const isTv = pathname === "/tv";
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
  // PR 029: /dashboard pages show only dashboard groups, tatakelola pages only tatakelola groups, Beranda shows all.
  // Logged-in users do not see groups their role cannot open; anonymous visitors see them (they lead to /login).
  const allGroups = useNavGroups();
  const area = routeArea(pathname || "/");
  const navGroups = useMemo(() => {
    const visible = allGroups.filter((g) => {
      if (!user) return true;
      if (g.permission && !hasPerm(user.permissions, g.permission)) return false;
      if (g.area === "tatakelola" && !hasPerm(user.permissions, "tatakelola")) return false;
      return true;
    });
    if (!visible.some((g) => g.area)) return visible; // menu without areas (migration 051 not applied yet)
    if (area === "dashboard" || area === "tatakelola") return visible.filter((g) => g.area === area);
    return visible;
  }, [allGroups, area, user]);
  const match = useNavMatch(navGroups);

  if (tvMode)
    return (
      <main className="h-screen w-screen overflow-hidden bg-white text-slate-900">{children}</main>
    );

  return (
    <main className={`flex min-h-screen flex-col bg-white text-slate-900 transition-[padding] duration-300 print:pl-0 ${collapsed ? "lg:pl-[72px]" : "lg:pl-[280px]"}`}>
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
            {/* Beranda: home.jpg runs continuously from the very top behind the transparent header down through the hero */}
            <div
              aria-hidden
              data-testid="home-bg"
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 bg-white bg-cover bg-no-repeat bg-[position:right_top]"
              style={{
                height: homeBgH ? `${homeBgH}px` : "760px",
                backgroundImage: `url(${PUBLIC_BASE_PATH}/home.jpg)`
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 bg-gradient-to-r from-white/95 via-white/70 to-transparent lg:from-white/90 lg:via-white/40"
              style={{ height: homeBgH ? `${homeBgH}px` : "760px" }}
            />
          </>
        ) : null}
        <div className="print:hidden">
          <DashboardHeader
            authenticated={authenticated}
            consoleMode={consoleMode}
            transparent={isHome}
            {...(isLite ? { title: t("skdr.lite.title"), subtitle: t("skdr.lite.subtitle"), compact: true } : isTv ? { compact: true } : {})}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          />
        </div>
        <div className={`w-full flex-1 ${isDirectoryPage || isTv ? 'py-0' : 'pb-3 md:pb-5'}`}>
          {/* PR 018: no breadcrumb on Dasbor Utama or Beranda; PR 027: nor on the one-screen Dasbor Zoonosis Lite; PR 050: nor on Mode TV */}
          {pathname === "/main-dashboard" || isLite || isHome || isTv ? null : <div className="print:hidden"><Breadcrumbs match={match} /></div>}
          <div className={isHome || isTv ? "" : "pt-3 md:pt-4"}>{children}</div>
        </div>
      </div>
      {!isTv ? (
        <div className="print:hidden">
          <Footer />
        </div>
      ) : null}
    </main>
  );
}
