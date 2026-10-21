'use client'
// PR 017: left sidebar with grouped navigation (Beranda, Dasbor, Transaksi, Integrasi, Bantuan & Dokumentasi).
// Desktop (lg+): persistent, collapsible to icon-only (tooltips). Mobile: slide-in drawer.
import { tr } from "@/lib/i18n/LanguageContext";
import { X, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SidebarGroup, SidebarItem } from "@/lib/menu";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSettings } from "@/lib/settings-context";

type Match = { group: SidebarGroup; item: SidebarItem; sub?: SidebarItem } | null;
type Props = {
  open: boolean; collapsed: boolean; menuGroups: SidebarGroup[]; match: Match
  onClose: () => void; onToggleCollapse: () => void
};

export default function DashboardSidebar({ open, collapsed, menuGroups, match, onClose, onToggleCollapse }: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [itemOpen, setItemOpen] = useState<Record<string, boolean>>({});
  const [flyout, setFlyout] = useState<string | null>(null);
  const flyRef = useRef<HTMLLIElement | null>(null);
  const gk = (g: SidebarGroup, i: number) => g.id || g.title || String(i);
  const ik = (it: SidebarItem) => it.id || it.label;

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!flyout) return;
    const down = (e: MouseEvent) => { if (flyRef.current && !flyRef.current.contains(e.target as Node)) setFlyout(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setFlyout(null); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [flyout]);
  useEffect(() => { if (!collapsed) setFlyout(null); }, [collapsed]);

  // auto-expand the active group and parent item
  useEffect(() => {
    if (!match) return;
    setGroupOpen((p) => ({ ...p, [match.group.id || match.group.title]: true }));
    if (match.sub) setItemOpen((p) => ({ ...p, [ik(match.item)]: true }));
  }, [match]);

  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/Logo-Kemenkes.png`;
  const appTitle = settings.app_name || tr("skdr.layout.appName");
  const appSubtitle = settings.app_tagline || tr("skdr.layout.appTagline");
  // icon-only applies to the desktop rail only; the mobile drawer is always full width
  const rail = collapsed && !open;

  const Tip = ({ label }: { label: string }) => rail ? (
    <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-[80] ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block group-focus-visible:block">{label}</span>
  ) : null;

  const linkCls = (active: boolean) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/40 ${rail ? "justify-center px-0" : ""} ${active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`;

  const ItemLink = ({ it, active }: { it: SidebarItem; active: boolean }) => {
    const Icon = it.icon;
    return (
      <Link href={it.href || "#"} onClick={onClose} aria-current={active ? "page" : undefined} aria-label={rail ? it.label : undefined}
        title={!rail ? it.description : undefined} data-nav-item className={linkCls(active)}>
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-slate-400"}`} />}
        {!rail && <span className="truncate">{it.label}</span>}
        <Tip label={it.label} />
      </Link>
    );
  };

  return (
    <aside aria-label="Navigasi utama" data-testid="nav-sidebar" data-collapsed={rail ? "true" : "false"}
      className={`fixed left-0 top-0 z-[60] flex h-screen flex-col border-r border-slate-100 bg-white text-slate-800 shadow-[2px_0_12px_rgba(0,0,0,0.03)] transition-[transform,width] duration-300
        ${open ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full lg:translate-x-0"} ${rail ? "lg:w-[72px]" : "lg:w-[280px]"}`}>
      <div className="h-[4px] shrink-0 bg-primary" />
      <div className={`flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 py-4 ${rail ? "px-2" : "px-4"}`}>
        <div className={`flex min-w-0 items-center gap-3 ${rail ? "mx-auto" : ""}`}>
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={tr("skdr.layout.logo")} className="h-auto max-h-8 w-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>
          {!rail && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase tracking-wide text-slate-800">{appTitle}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{appSubtitle}</p>
            </div>
          )}
        </div>
        <button type="button" aria-label={t("common.closeSidebar")} onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden">
          <X className="h-4 w-4" />
        </button>
        {!rail && (
          <button type="button" onClick={onToggleCollapse} data-testid="sidebar-toggle" aria-label="Tutup sidebar" title="Tutup sidebar"
            className="hidden shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-primary/40 hover:text-primary lg:inline-flex">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
      {rail && (
        <div className="hidden shrink-0 justify-center border-b border-slate-100 py-2 lg:flex">
          <button type="button" onClick={onToggleCollapse} data-testid="sidebar-toggle" aria-label="Buka sidebar"
            className="group relative inline-flex cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-primary/40 hover:text-primary">
            <PanelLeftOpen className="h-4 w-4" />
            <Tip label="Buka sidebar" />
          </button>
        </div>
      )}

      <nav className={`flex-1 py-4 ${rail ? "overflow-visible px-2" : "overflow-y-auto px-3"}`} data-testid="nav-groups">
        {menuGroups.map((group, gi) => {
          const key = gk(group, gi);
          const activeGroup = match?.group === group;
          const isOpen = rail || groupOpen[key] !== false; // groups open by default; user can collapse
          return (
            <div key={key} className={rail ? "mb-2 border-b border-slate-100 pb-2 last:border-0" : "mb-4"}>
              {!rail && (
                <button type="button" aria-expanded={isOpen} onClick={() => setGroupOpen((p) => ({ ...p, [key]: !isOpen }))}
                  className={`flex w-full items-center justify-between rounded-lg px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeGroup ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}>
                  <span>{group.title}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "" : "-rotate-90"}`} />
                </button>
              )}
              {isOpen && (
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const hasSubs = !!item.subItems?.length;
                    const active = !!match && match.item === item;
                    if (!hasSubs) return <li key={ik(item)}><ItemLink it={item} active={active} /></li>;
                    const subOpen = !!itemOpen[ik(item)];
                    const Icon = item.icon;
                    return (
                      <li key={ik(item)} className="relative" ref={flyout === ik(item) ? flyRef : undefined}>
                        <button type="button" aria-expanded={rail ? flyout === ik(item) : subOpen} aria-haspopup={rail ? "true" : undefined} aria-label={rail ? item.label : undefined}
                          onClick={() => { if (rail) setFlyout(flyout === ik(item) ? null : ik(item)); else setItemOpen((p) => ({ ...p, [ik(item)]: !subOpen })); }}
                          className={`${linkCls(active)} w-full text-left`}>
                          {Icon && <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-slate-400"}`} />}
                          {!rail && <span className="flex-1 truncate">{item.label}</span>}
                          {!rail && (subOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />)}
                          <Tip label={item.label} />
                        </button>
                        {rail && flyout === ik(item) && (
                          <div role="menu" data-testid="nav-flyout" className="absolute left-full top-0 z-[80] ml-3 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                            <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                            {item.subItems!.map((sub) => {
                              const SubIcon = sub.icon; const on = !!match && match.sub === sub;
                              return (
                                <Link key={sub.id || sub.href} href={sub.href || "#"} role="menuitem" data-nav-item onClick={() => { setFlyout(null); onClose(); }} aria-current={on ? "page" : undefined}
                                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${on ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"}`}>
                                  {SubIcon && <SubIcon className={`h-4 w-4 ${on ? "text-primary" : "text-slate-400"}`} />}{sub.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                        {subOpen && !rail && (
                          <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-100 pl-3">
                            {item.subItems!.map((sub) => <li key={sub.id || sub.href}><ItemLink it={sub} active={!!match && match.sub === sub} /></li>)}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}
