'use client'
// PR 068: Modul Pengaturan Navigasi & Menu Sidebar SKDR (Tata Kelola)
// Mengatur Grup Navigasi, Menu, Sub-Menu, Ikon, Rute, Akses, Urutan, dan Status Aktif secara visual dan dinamis.
import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  MoveUp,
  MoveDown,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  SlidersHorizontal,
  ShieldCheck,
  Lock,
  Layers,
  Sparkles,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Compass,
  ArrowRight,
  Circle,
  FolderPlus,
  HelpCircle,
  PanelLeft,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import {
  SidebarGroupConfig,
  SidebarItemConfig,
  SidebarSubItemConfig,
  DEFAULT_NAVIGATION_CONFIG,
  MENU_ICON_MAP,
  resolveMenuIcon,
  NavArea,
} from '@/lib/menu'
import { useSettings } from '@/lib/settings-context'

const AREA_BADGES: Record<NavArea, { label: string; cls: string }> = {
  home: { label: 'Beranda', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  dashboard: { label: 'Dasbor', cls: 'border-purple-200 bg-purple-50 text-purple-700' },
  tatakelola: { label: 'Tata Kelola', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
}

export default function NavigasiManager() {
  const { settings, saveNavigationMenu, resetNavigationMenu } = useSettings()

  // Clone from settings or fallback to default
  const initialGroups = useMemo<SidebarGroupConfig[]>(() => {
    if (Array.isArray(settings.navigation_menu) && settings.navigation_menu.length > 0) {
      return JSON.parse(JSON.stringify(settings.navigation_menu))
    }
    return JSON.parse(JSON.stringify(DEFAULT_NAVIGATION_CONFIG))
  }, [settings.navigation_menu])

  const [groups, setGroups] = useState<SidebarGroupConfig[]>(initialGroups)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    grp_beranda: true,
    grp_dasbor: true,
    grp_tatakelola: true,
    grp_transaksi: true,
  })
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    mod_main_dashboard: true,
    mod_dasbor_mbg: true,
    mod_dasbor_kategori: true,
    mod_form_pe: true,
    mod_program_mbg: true,
  })
  const [search, setSearch] = useState('')
  const [filterArea, setFilterArea] = useState<'all' | NavArea>('all')
  const [showPreview, setShowPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Modals state
  const [groupModal, setGroupModal] = useState<{
    open: boolean
    mode: 'add' | 'edit'
    index?: number
    data: Partial<SidebarGroupConfig>
  }>({ open: false, mode: 'add', data: {} })

  const [itemModal, setItemModal] = useState<{
    open: boolean
    mode: 'add' | 'edit'
    groupIndex: number
    itemIndex?: number
    data: Partial<SidebarItemConfig>
  }>({ open: false, mode: 'add', groupIndex: 0, data: {} })

  const [subModal, setSubModal] = useState<{
    open: boolean
    mode: 'add' | 'edit'
    groupIndex: number
    itemIndex: number
    subIndex?: number
    data: Partial<SidebarSubItemConfig>
  }>({ open: false, mode: 'add', groupIndex: 0, itemIndex: 0, data: {} })

  const [iconPicker, setIconPicker] = useState<{
    open: boolean
    target: 'item' | 'sub'
    currentIcon: string
    onSelect: (iconName: string) => void
  }>({ open: false, target: 'item', currentIcon: '', onSelect: () => {} })

  const [iconSearch, setIconSearch] = useState('')

  // Dirty detection
  const isDirty = useMemo(() => {
    return JSON.stringify(groups) !== JSON.stringify(initialGroups)
  }, [groups, initialGroups])

  // Filtered groups
  const filteredGroups = useMemo(() => {
    let result = groups
    if (filterArea !== 'all') {
      result = result.filter((g) => g.area === filterArea)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((g) => {
        const matchGroup = g.title.toLowerCase().includes(q)
        const matchItems = (g.items || []).some((it) => {
          const matchItem = it.label.toLowerCase().includes(q) || (it.href && it.href.toLowerCase().includes(q))
          const matchSubs = (it.subItems || []).some(
            (s) => s.label.toLowerCase().includes(q) || (s.href && s.href.toLowerCase().includes(q))
          )
          return matchItem || matchSubs
        })
        return matchGroup || matchItems
      })
    }
    return result
  }, [groups, filterArea, search])

  // --- Handlers: Reordering ---
  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= groups.length) return
    const next = [...groups]
    const [moved] = next.splice(index, 1)
    next.splice(targetIndex, 0, moved)
    next.forEach((g, idx) => {
      g.order = idx + 1
    })
    setGroups(next)
  }

  const moveItem = (groupIndex: number, itemIndex: number, direction: 'up' | 'down') => {
    const next = [...groups]
    const items = [...(next[groupIndex].items || [])]
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1
    if (targetIndex < 0 || targetIndex >= items.length) return
    const [moved] = items.splice(itemIndex, 1)
    items.splice(targetIndex, 0, moved)
    items.forEach((it, idx) => {
      it.order = idx + 1
    })
    next[groupIndex].items = items
    setGroups(next)
  }

  const moveSubItem = (groupIndex: number, itemIndex: number, subIndex: number, direction: 'up' | 'down') => {
    const next = [...groups]
    const items = [...(next[groupIndex].items || [])]
    const subs = [...(items[itemIndex].subItems || [])]
    const targetIndex = direction === 'up' ? subIndex - 1 : subIndex + 1
    if (targetIndex < 0 || targetIndex >= subs.length) return
    const [moved] = subs.splice(subIndex, 1)
    subs.splice(targetIndex, 0, moved)
    subs.forEach((s, idx) => {
      s.order = idx + 1
    })
    items[itemIndex].subItems = subs
    next[groupIndex].items = items
    setGroups(next)
  }

  // --- Handlers: Toggles ---
  const toggleGroupEnabled = (groupIndex: number) => {
    const next = [...groups]
    next[groupIndex].enabled = !next[groupIndex].enabled
    setGroups(next)
  }

  const toggleItemEnabled = (groupIndex: number, itemIndex: number) => {
    const next = [...groups]
    next[groupIndex].items[itemIndex].enabled = !next[groupIndex].items[itemIndex].enabled
    setGroups(next)
  }

  const toggleSubItemEnabled = (groupIndex: number, itemIndex: number, subIndex: number) => {
    const next = [...groups]
    const sub = next[groupIndex].items[itemIndex].subItems?.[subIndex]
    if (sub) {
      sub.enabled = !sub.enabled
      setGroups(next)
    }
  }

  // --- Handlers: Delete ---
  const deleteGroup = (index: number) => {
    const g = groups[index]
    if (confirm(`Hapus grup navigasi "${g.title}" beserta seluruh isinya?`)) {
      const next = groups.filter((_, i) => i !== index)
      setGroups(next)
      toast.success(`Grup "${g.title}" dihapus`)
    }
  }

  const deleteItem = (groupIndex: number, itemIndex: number) => {
    const it = groups[groupIndex].items[itemIndex]
    if (confirm(`Hapus menu "${it.label}"?`)) {
      const next = [...groups]
      next[groupIndex].items = next[groupIndex].items.filter((_, i) => i !== itemIndex)
      setGroups(next)
      toast.success(`Menu "${it.label}" dihapus`)
    }
  }

  const deleteSubItem = (groupIndex: number, itemIndex: number, subIndex: number) => {
    const s = groups[groupIndex].items[itemIndex].subItems?.[subIndex]
    if (!s) return
    if (confirm(`Hapus sub-menu "${s.label}"?`)) {
      const next = [...groups]
      next[groupIndex].items[itemIndex].subItems = next[groupIndex].items[itemIndex].subItems?.filter(
        (_, i) => i !== subIndex
      )
      setGroups(next)
      toast.success(`Sub-menu "${s.label}" dihapus`)
    }
  }

  // --- Handlers: Save & Reset ---
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await saveNavigationMenu(groups)
      if (res.ok) {
        toast.success('Pengaturan navigasi & modul berhasil disimpan ke sistem!')
      } else {
        toast.error(res.error || 'Gagal menyimpan pengaturan')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan navigasi')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (
      confirm(
        'Kembalikan struktur navigasi ke bawaan resmi sistem SKDR Indonesia? Perubahan kustom yang belum disimpan akan hilang.'
      )
    ) {
      setIsSaving(true)
      try {
        const res = await resetNavigationMenu()
        if (res.ok) {
          setGroups(JSON.parse(JSON.stringify(DEFAULT_NAVIGATION_CONFIG)))
          toast.success('Navigasi berhasil dikembalikan ke standar bawaan sistem!')
        } else {
          toast.error(res.error || 'Gagal mereset navigasi')
        }
      } catch (e: any) {
        toast.error(e?.message || 'Gagal mereset navigasi')
      } finally {
        setIsSaving(false)
      }
    }
  }

  const handleDiscard = () => {
    if (confirm('Batalkan seluruh perubahan yang belum disimpan?')) {
      setGroups(JSON.parse(JSON.stringify(initialGroups)))
      toast.info('Perubahan dibatalkan')
    }
  }

  // --- Modal Save Handlers ---
  const saveGroupModal = () => {
    if (!groupModal.data.title?.trim()) {
      toast.error('Nama grup navigasi wajib diisi')
      return
    }
    const next = [...groups]
    const id =
      groupModal.data.id?.trim() ||
      `grp_${groupModal.data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}`

    const newGroup: SidebarGroupConfig = {
      id,
      title: groupModal.data.title.trim(),
      area: (groupModal.data.area as NavArea) || 'tatakelola',
      enabled: groupModal.data.enabled ?? true,
      requiresAuth: groupModal.data.requiresAuth ?? false,
      permission: groupModal.data.permission?.trim() || undefined,
      order: groupModal.data.order || next.length + 1,
      items: groupModal.mode === 'edit' && groupModal.index !== undefined ? next[groupModal.index].items || [] : [],
    }

    if (groupModal.mode === 'add') {
      next.push(newGroup)
      toast.success(`Grup "${newGroup.title}" berhasil ditambahkan`)
    } else if (groupModal.index !== undefined) {
      next[groupModal.index] = { ...next[groupModal.index], ...newGroup }
      toast.success(`Grup "${newGroup.title}" berhasil diperbarui`)
    }
    setGroups(next)
    setGroupModal({ open: false, mode: 'add', data: {} })
  }

  const saveItemModal = () => {
    if (!itemModal.data.label?.trim()) {
      toast.error('Nama menu wajib diisi')
      return
    }
    const next = [...groups]
    const g = next[itemModal.groupIndex]
    const id =
      itemModal.data.id?.trim() ||
      `mod_${itemModal.data.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}`

    const newItem: SidebarItemConfig = {
      id,
      label: itemModal.data.label.trim(),
      href: itemModal.data.href?.trim() || '#',
      icon: itemModal.data.icon || 'Circle',
      badge: itemModal.data.badge?.trim() || undefined,
      description: itemModal.data.description?.trim() || undefined,
      enabled: itemModal.data.enabled ?? true,
      order: itemModal.data.order || (g.items?.length || 0) + 1,
      subItems:
        itemModal.mode === 'edit' && itemModal.itemIndex !== undefined
          ? g.items[itemModal.itemIndex].subItems || []
          : [],
    }

    if (!g.items) g.items = []
    if (itemModal.mode === 'add') {
      g.items.push(newItem)
      toast.success(`Menu "${newItem.label}" berhasil ditambahkan ke ${g.title}`)
    } else if (itemModal.itemIndex !== undefined) {
      g.items[itemModal.itemIndex] = { ...g.items[itemModal.itemIndex], ...newItem }
      toast.success(`Menu "${newItem.label}" berhasil diperbarui`)
    }
    setGroups(next)
    setItemModal({ open: false, mode: 'add', groupIndex: 0, data: {} })
  }

  const saveSubModal = () => {
    if (!subModal.data.label?.trim()) {
      toast.error('Nama sub-menu wajib diisi')
      return
    }
    const next = [...groups]
    const it = next[subModal.groupIndex].items[subModal.itemIndex]
    const id =
      subModal.data.id?.trim() ||
      `sub_${subModal.data.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}`

    const newSub: SidebarSubItemConfig = {
      id,
      label: subModal.data.label.trim(),
      href: subModal.data.href?.trim() || '#',
      icon: subModal.data.icon || 'Circle',
      badge: subModal.data.badge?.trim() || undefined,
      description: subModal.data.description?.trim() || undefined,
      enabled: subModal.data.enabled ?? true,
      order: subModal.data.order || (it.subItems?.length || 0) + 1,
    }

    if (!it.subItems) it.subItems = []
    if (subModal.mode === 'add') {
      it.subItems.push(newSub)
      toast.success(`Sub-menu "${newSub.label}" berhasil ditambahkan ke ${it.label}`)
    } else if (subModal.subIndex !== undefined) {
      it.subItems[subModal.subIndex] = { ...it.subItems[subModal.subIndex], ...newSub }
      toast.success(`Sub-menu "${newSub.label}" berhasil diperbarui`)
    }
    setGroups(next)
    setSubModal({ open: false, mode: 'add', groupIndex: 0, itemIndex: 0, data: {} })
  }

  // Icons list for picker
  const availableIcons = useMemo(() => {
    const list = Object.keys(MENU_ICON_MAP)
    if (!iconSearch.trim()) return list
    const q = iconSearch.toLowerCase()
    return list.filter((name) => name.toLowerCase().includes(q))
  }, [iconSearch])

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="navigasi-manager">
      {/* Page Header (PR 067: 2-Grid ~70/30%, No eyebrow, Active action buttons) */}
      <PageHeader
        title="Pengaturan Modul & Navigasi Sidebar"
        subtitle="Kelola struktur hierarki sidebar aplikasi SKDR Indonesia: tambahkan grup navigasi baru, atur urutan menu modul, sesuaikan rute URL, ikon, lencana, hingga sub-menu bertingkat secara fleksibel."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700">
              <SlidersHorizontal className="h-3 w-3 text-primary" /> {groups.length} Grup
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700">
              <Layers className="h-3 w-3 text-primary" />{' '}
              {groups.reduce((acc, g) => acc + (g.items?.length || 0), 0)} Menu
            </span>
            {isDirty && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-bold text-amber-800 animate-pulse">
                <AlertCircle className="h-3 w-3" /> Ada perubahan belum disimpan
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-xs transition-colors ${
                showPreview
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title="Tinjau tampilan sidebar saat ini"
            >
              <PanelLeft className="h-3.5 w-3.5" />
              {showPreview ? 'Sembunyikan Pratinjau' : 'Pratinjau Sidebar'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50"
              title="Kembalikan struktur menu ke bawaan sistem"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Default
            </button>
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 shadow-xs hover:bg-rose-50 disabled:opacity-50"
              >
                Batal
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> Simpan Perubahan
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Control bar: Search, Area filter, and Add Group */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari grup, nama menu, rute..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-8 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Area pills */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {(['all', 'home', 'dashboard', 'tatakelola'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setFilterArea(a)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  filterArea === a
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {a === 'all' ? 'Semua Area' : AREA_BADGES[a]?.label || a}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setGroupModal({
              open: true,
              mode: 'add',
              data: { area: 'tatakelola', enabled: true, requiresAuth: true },
            })
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Tambah Grup Navigasi
        </button>
      </div>

      {/* Main Grid: Tree Builder + Live Preview (Optional) */}
      <div className={`grid grid-cols-1 gap-6 ${showPreview ? 'xl:grid-cols-12' : ''}`}>
        {/* Navigation Tree Builder */}
        <div className={`space-y-4 ${showPreview ? 'xl:col-span-8' : ''}`}>
          {filteredGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center text-slate-500">
              <Compass className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Tidak ada grup navigasi yang cocok</p>
              <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian atau ganti filter area.</p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const realGroupIndex = groups.findIndex((g) => g.id === group.id)
              const isGroupOpen = expandedGroups[group.id] !== false
              const areaInfo = AREA_BADGES[group.area || 'tatakelola']

              return (
                <div
                  key={group.id}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    group.enabled
                      ? 'border-slate-200 bg-white shadow-2xs'
                      : 'border-slate-200/60 bg-slate-50/50 opacity-70'
                  }`}
                >
                  {/* Group Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Collapse toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((p) => ({
                            ...p,
                            [group.id]: !isGroupOpen,
                          }))
                        }
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                        title={isGroupOpen ? 'Tutup grup' : 'Buka grup'}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            isGroupOpen ? '' : '-rotate-90'
                          }`}
                        />
                      </button>

                      {/* Group Title & Badges */}
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-bold uppercase tracking-wider text-xs sm:text-sm text-slate-800">
                          {group.title}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            areaInfo?.cls || 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {areaInfo?.label || group.area}
                        </span>
                        {group.permission && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                            title={`Izin akses: ${group.permission}`}
                          >
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            {group.permission}
                          </span>
                        )}
                        {group.requiresAuth && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                            title="Memerlukan login"
                          >
                            <Lock className="h-3 w-3 text-slate-500" /> Login
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-slate-400">
                          ({group.items?.length || 0} menu)
                        </span>
                      </div>
                    </div>

                    {/* Group Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Move Up/Down */}
                      <button
                        type="button"
                        onClick={() => moveGroup(realGroupIndex, 'up')}
                        disabled={realGroupIndex === 0}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                        title="Geser grup ke atas"
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGroup(realGroupIndex, 'down')}
                        disabled={realGroupIndex === groups.length - 1}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                        title="Geser grup ke bawah"
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </button>

                      {/* Active toggle */}
                      <button
                        type="button"
                        onClick={() => toggleGroupEnabled(realGroupIndex)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                          group.enabled
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                        title={group.enabled ? 'Grup aktif' : 'Grup non-aktif'}
                      >
                        {group.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">{group.enabled ? 'Aktif' : 'Non-aktif'}</span>
                      </button>

                      {/* Add menu item */}
                      <button
                        type="button"
                        onClick={() => {
                          setItemModal({
                            open: true,
                            mode: 'add',
                            groupIndex: realGroupIndex,
                            data: { enabled: true, icon: 'Circle' },
                          })
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:border-primary/40 hover:text-primary shadow-2xs"
                        title="Tambah menu baru ke grup ini"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Tambah Menu</span>
                      </button>

                      {/* Edit group */}
                      <button
                        type="button"
                        onClick={() => {
                          setGroupModal({
                            open: true,
                            mode: 'edit',
                            index: realGroupIndex,
                            data: { ...group },
                          })
                        }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        title="Edit grup"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete group */}
                      <button
                        type="button"
                        onClick={() => deleteGroup(realGroupIndex)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Hapus grup"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Group Content: Items List */}
                  {isGroupOpen && (
                    <div className="p-3 sm:p-4 space-y-2">
                      {(!group.items || group.items.length === 0) ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                          Belum ada menu di dalam grup ini.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setItemModal({
                                open: true,
                                mode: 'add',
                                groupIndex: realGroupIndex,
                                data: { enabled: true, icon: 'Circle' },
                              })
                            }}
                            className="font-bold text-primary hover:underline"
                          >
                            Tambah sekarang
                          </button>
                        </div>
                      ) : (
                        group.items.map((item, itemIdx) => {
                          const IconComp = resolveMenuIcon(item.icon)
                          const isItemOpen = expandedItems[item.id] !== false
                          const hasSubs = (item.subItems?.length || 0) > 0

                          return (
                            <div
                              key={item.id || itemIdx}
                              className={`rounded-xl border transition ${
                                item.enabled
                                  ? 'border-slate-200 bg-white hover:border-slate-300'
                                  : 'border-slate-200/60 bg-slate-50/70 opacity-60'
                              }`}
                            >
                              {/* Menu Row */}
                              <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 sm:px-3.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {/* Icon preview */}
                                  <div
                                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 shrink-0"
                                    title={`Ikon: ${item.icon || 'Circle'}`}
                                  >
                                    <IconComp className="h-4 w-4" />
                                  </div>

                                  {/* Label & URL */}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                        {item.label}
                                      </span>
                                      {item.badge && (
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold uppercase text-amber-800">
                                          {item.badge}
                                        </span>
                                      )}
                                      {hasSubs && (
                                        <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500">
                                          {item.subItems?.length} sub
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                      <code className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                        {item.href || '#'}
                                      </code>
                                      {item.description && (
                                        <span className="hidden md:inline truncate max-w-xs text-slate-400">
                                          · {item.description}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Menu Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Move item up/down */}
                                  <button
                                    type="button"
                                    onClick={() => moveItem(realGroupIndex, itemIdx, 'up')}
                                    disabled={itemIdx === 0}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                                    title="Pindah ke atas"
                                  >
                                    <MoveUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveItem(realGroupIndex, itemIdx, 'down')}
                                    disabled={itemIdx === group.items.length - 1}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                                    title="Pindah ke bawah"
                                  >
                                    <MoveDown className="h-3 w-3" />
                                  </button>

                                  {/* Toggle active */}
                                  <button
                                    type="button"
                                    onClick={() => toggleItemEnabled(realGroupIndex, itemIdx)}
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      item.enabled
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                    title={item.enabled ? 'Menu aktif' : 'Menu non-aktif'}
                                  >
                                    {item.enabled ? 'Aktif' : 'Non-aktif'}
                                  </button>

                                  {/* Add sub-menu */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubModal({
                                        open: true,
                                        mode: 'add',
                                        groupIndex: realGroupIndex,
                                        itemIndex: itemIdx,
                                        data: { enabled: true, icon: 'Circle' },
                                      })
                                    }}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-primary/40 hover:text-primary shadow-2xs"
                                    title="Tambah sub-menu di bawah menu ini"
                                  >
                                    + Sub-Menu
                                  </button>

                                  {/* Edit item */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setItemModal({
                                        open: true,
                                        mode: 'edit',
                                        groupIndex: realGroupIndex,
                                        itemIndex: itemIdx,
                                        data: { ...item },
                                      })
                                    }}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                    title="Edit menu"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>

                                  {/* Delete item */}
                                  <button
                                    type="button"
                                    onClick={() => deleteItem(realGroupIndex, itemIdx)}
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    title="Hapus menu"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>

                                  {/* Toggle subItems view */}
                                  {hasSubs && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedItems((p) => ({
                                          ...p,
                                          [item.id]: !isItemOpen,
                                        }))
                                      }
                                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 ml-1"
                                      title={isItemOpen ? 'Tutup sub-menu' : 'Buka sub-menu'}
                                    >
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                          isItemOpen ? '' : '-rotate-90'
                                        }`}
                                      />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Sub-Items List */}
                              {hasSubs && isItemOpen && (
                                <div className="border-t border-slate-100 bg-slate-50/50 p-2 pl-6 sm:pl-8 space-y-1.5">
                                  {item.subItems!.map((sub, subIdx) => {
                                    const SubIconComp = resolveMenuIcon(sub.icon)
                                    return (
                                      <div
                                        key={sub.id || subIdx}
                                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 px-3 text-xs transition ${
                                          sub.enabled ? 'opacity-100' : 'opacity-50'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <SubIconComp className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                          <span className="font-semibold text-slate-800 truncate">
                                            {sub.label}
                                          </span>
                                          <code className="font-mono text-[9px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                                            {sub.href}
                                          </code>
                                          {sub.badge && (
                                            <span className="rounded bg-amber-50 border border-amber-200 px-1 text-[8px] font-bold text-amber-800">
                                              {sub.badge}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              moveSubItem(realGroupIndex, itemIdx, subIdx, 'up')
                                            }
                                            disabled={subIdx === 0}
                                            className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                            title="Ke atas"
                                          >
                                            <MoveUp className="h-2.5 w-2.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              moveSubItem(realGroupIndex, itemIdx, subIdx, 'down')
                                            }
                                            disabled={subIdx === item.subItems!.length - 1}
                                            className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                            title="Ke bawah"
                                          >
                                            <MoveDown className="h-2.5 w-2.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              toggleSubItemEnabled(realGroupIndex, itemIdx, subIdx)
                                            }
                                            className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${
                                              sub.enabled
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-slate-100 text-slate-500'
                                            }`}
                                          >
                                            {sub.enabled ? 'Aktif' : 'Non-aktif'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSubModal({
                                                open: true,
                                                mode: 'edit',
                                                groupIndex: realGroupIndex,
                                                itemIndex: itemIdx,
                                                subIndex: subIdx,
                                                data: { ...sub },
                                              })
                                            }}
                                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                            title="Edit sub-menu"
                                          >
                                            <Pencil className="h-2.5 w-2.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              deleteSubItem(realGroupIndex, itemIdx, subIdx)
                                            }
                                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                            title="Hapus sub-menu"
                                          >
                                            <Trash2 className="h-2.5 w-2.5" />
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Live Sidebar Preview (Interactive side rail) */}
        {showPreview && (
          <div className="xl:col-span-4">
            <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <PanelLeft className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Pratinjau Sidebar Nyata
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400">Live Preview</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Berikut simulasi tampilan menu sidebar dengan data yang sedang Anda sunting saat ini:
              </p>

              {/* Mock Sidebar Canvas */}
              <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 space-y-4">
                {groups
                  .filter((g) => g.enabled)
                  .map((grp) => (
                    <div key={grp.id} className="space-y-1">
                      <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {grp.title}
                      </div>
                      <div className="space-y-0.5">
                        {(grp.items || [])
                          .filter((it) => it.enabled)
                          .map((it) => {
                            const Icon = resolveMenuIcon(it.icon)
                            return (
                              <div key={it.id} className="space-y-0.5">
                                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/60 transition">
                                  <div className="flex items-center gap-2 truncate">
                                    <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    <span className="truncate">{it.label}</span>
                                  </div>
                                  {it.badge && (
                                    <span className="rounded bg-amber-50 border border-amber-200 px-1 text-[8px] font-bold text-amber-800">
                                      {it.badge}
                                    </span>
                                  )}
                                </div>
                                {it.subItems && it.subItems.length > 0 && (
                                  <div className="ml-4 border-l border-slate-200 pl-2 space-y-0.5">
                                    {it.subItems
                                      .filter((s) => s.enabled)
                                      .map((s) => {
                                        const SubIcon = resolveMenuIcon(s.icon)
                                        return (
                                          <div
                                            key={s.id}
                                            className="flex items-center gap-2 rounded px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-200/60"
                                          >
                                            <SubIcon className="h-3 w-3 text-slate-400 shrink-0" />
                                            <span className="truncate">{s.label}</span>
                                          </div>
                                        )
                                      })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Group (Tambah/Edit) */}
      <Modal
        open={groupModal.open}
        title={groupModal.mode === 'add' ? 'Tambah Grup Navigasi' : 'Edit Grup Navigasi'}
        onClose={() => setGroupModal({ open: false, mode: 'add', data: {} })}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Grup Navigasi <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={groupModal.data.title || ''}
              onChange={(e) =>
                setGroupModal((p) => ({
                  ...p,
                  data: { ...p.data, title: e.target.value },
                }))
              }
              placeholder="Contoh: Surveilans Khusus, Analisa Wilayah"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Area Navigasi <span className="text-rose-500">*</span>
              </label>
              <select
                value={groupModal.data.area || 'tatakelola'}
                onChange={(e) =>
                  setGroupModal((p) => ({
                    ...p,
                    data: { ...p.data, area: e.target.value as NavArea },
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
              >
                <option value="home">Beranda (Hanya tampil di Home)</option>
                <option value="dashboard">Dasbor (Area Analitik Dasbor)</option>
                <option value="tatakelola">Tata Kelola (Area Administrasi & CMS)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ID Grup (Unik)</label>
              <input
                type="text"
                value={groupModal.data.id || ''}
                onChange={(e) =>
                  setGroupModal((p) => ({
                    ...p,
                    data: { ...p.data, id: e.target.value },
                  }))
                }
                placeholder="Otomatis jika dikosongkan"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Kode Izin Akses (Permission) <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={groupModal.data.permission || ''}
              onChange={(e) =>
                setGroupModal((p) => ({
                  ...p,
                  data: { ...p.data, permission: e.target.value },
                }))
              }
              placeholder="Contoh: tatakelola, integrasi, user_management"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Kosongkan jika grup dapat diakses oleh semua pengguna yang masuk.
            </p>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={groupModal.data.requiresAuth ?? false}
                onChange={(e) =>
                  setGroupModal((p) => ({
                    ...p,
                    data: { ...p.data, requiresAuth: e.target.checked },
                  }))
                }
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              Wajib Login (Pengguna Terotentikasi)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={groupModal.data.enabled ?? true}
                onChange={(e) =>
                  setGroupModal((p) => ({
                    ...p,
                    data: { ...p.data, enabled: e.target.checked },
                  }))
                }
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              Status Aktif
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setGroupModal({ open: false, mode: 'add', data: {} })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={saveGroupModal}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark"
            >
              {groupModal.mode === 'add' ? 'Tambah Grup' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Menu Item (Tambah/Edit) */}
      <Modal
        open={itemModal.open}
        title={itemModal.mode === 'add' ? 'Tambah Menu Modul' : 'Edit Menu Modul'}
        onClose={() => setItemModal({ open: false, mode: 'add', groupIndex: 0, data: {} })}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Menu <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={itemModal.data.label || ''}
              onChange={(e) =>
                setItemModal((p) => ({
                  ...p,
                  data: { ...p.data, label: e.target.value },
                }))
              }
              placeholder="Contoh: Laporan Mingguan, Pemetaan Vektor"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rute / Tautan (URL) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={itemModal.data.href || ''}
                onChange={(e) =>
                  setItemModal((p) => ({
                    ...p,
                    data: { ...p.data, href: e.target.value },
                  }))
                }
                placeholder="/dashboard/custom atau #"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[10px] text-slate-400">Gunakan # jika menu ini memiliki sub-menu dropdown.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ikon Menu</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIconPicker({
                      open: true,
                      target: 'item',
                      currentIcon: itemModal.data.icon || 'Circle',
                      onSelect: (iconName) => {
                        setItemModal((p) => ({
                          ...p,
                          data: { ...p.data, icon: iconName },
                        }))
                        setIconPicker((p) => ({ ...p, open: false }))
                      },
                    })
                  }}
                  className="flex flex-1 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-primary/40 shadow-2xs"
                >
                  <span className="flex items-center gap-2">
                    {(() => {
                      const Icon = resolveMenuIcon(itemModal.data.icon)
                      return <Icon className="h-4 w-4 text-primary" />
                    })()}
                    <span>{itemModal.data.icon || 'Pilih Ikon'}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Lencana (Badge)</label>
              <input
                type="text"
                value={itemModal.data.badge || ''}
                onChange={(e) =>
                  setItemModal((p) => ({
                    ...p,
                    data: { ...p.data, badge: e.target.value },
                  }))
                }
                placeholder="Contoh: Baru, Beta, Segera"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ID Menu (Unik)</label>
              <input
                type="text"
                value={itemModal.data.id || ''}
                onChange={(e) =>
                  setItemModal((p) => ({
                    ...p,
                    data: { ...p.data, id: e.target.value },
                  }))
                }
                placeholder="Otomatis jika dikosongkan"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi Singkat</label>
            <textarea
              rows={2}
              value={itemModal.data.description || ''}
              onChange={(e) =>
                setItemModal((p) => ({
                  ...p,
                  data: { ...p.data, description: e.target.value },
                }))
              }
              placeholder="Jelaskan fungsi atau tujuan modul menu ini..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={itemModal.data.enabled ?? true}
                onChange={(e) =>
                  setItemModal((p) => ({
                    ...p,
                    data: { ...p.data, enabled: e.target.checked },
                  }))
                }
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              Status Aktif
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setItemModal({ open: false, mode: 'add', groupIndex: 0, data: {} })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={saveItemModal}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark"
            >
              {itemModal.mode === 'add' ? 'Tambah Menu' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Sub-Menu Item (Tambah/Edit) */}
      <Modal
        open={subModal.open}
        title={subModal.mode === 'add' ? 'Tambah Sub-Menu' : 'Edit Sub-Menu'}
        onClose={() => setSubModal({ open: false, mode: 'add', groupIndex: 0, itemIndex: 0, data: {} })}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Sub-Menu <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={subModal.data.label || ''}
              onChange={(e) =>
                setSubModal((p) => ({
                  ...p,
                  data: { ...p.data, label: e.target.value },
                }))
              }
              placeholder="Contoh: Ringkasan IBS, Tren Kasus"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rute / Tautan (URL) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={subModal.data.href || ''}
                onChange={(e) =>
                  setSubModal((p) => ({
                    ...p,
                    data: { ...p.data, href: e.target.value },
                  }))
                }
                placeholder="/dashboard/skdr/ringkasan"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ikon Sub-Menu</label>
              <button
                type="button"
                onClick={() => {
                  setIconPicker({
                    open: true,
                    target: 'sub',
                    currentIcon: subModal.data.icon || 'Circle',
                    onSelect: (iconName) => {
                      setSubModal((p) => ({
                        ...p,
                        data: { ...p.data, icon: iconName },
                      }))
                      setIconPicker((p) => ({ ...p, open: false }))
                    },
                  })
                }}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-primary/40 shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  {(() => {
                    const Icon = resolveMenuIcon(subModal.data.icon)
                    return <Icon className="h-4 w-4 text-primary" />
                  })()}
                  <span>{subModal.data.icon || 'Pilih Ikon'}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Deskripsi Singkat</label>
            <textarea
              rows={2}
              value={subModal.data.description || ''}
              onChange={(e) =>
                setSubModal((p) => ({
                  ...p,
                  data: { ...p.data, description: e.target.value },
                }))
              }
              placeholder="Keterangan singkat fungsi sub-menu ini..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={subModal.data.enabled ?? true}
                onChange={(e) =>
                  setSubModal((p) => ({
                    ...p,
                    data: { ...p.data, enabled: e.target.checked },
                  }))
                }
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              Status Aktif
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setSubModal({ open: false, mode: 'add', groupIndex: 0, itemIndex: 0, data: {} })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={saveSubModal}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark"
            >
              {subModal.mode === 'add' ? 'Tambah Sub-Menu' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Searchable Icon Picker */}
      <Modal
        open={iconPicker.open}
        title="Pilih Ikon Navigasi"
        onClose={() => setIconPicker((p) => ({ ...p, open: false }))}
        maxWidth="max-w-2xl"
      >
        <div className="p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Cari ikon (misal: Chart, File, Hospital, Shield, User)..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 p-1">
            {availableIcons.map((name) => {
              const Icon = MENU_ICON_MAP[name]
              const isSelected = iconPicker.currentIcon === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => iconPicker.onSelect(name)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-center transition ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:bg-slate-50'
                  }`}
                  title={name}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] truncate max-w-full">{name}</span>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setIconPicker((p) => ({ ...p, open: false }))}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
