'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE } from './public-path'

export interface SystemSettings { app_name: string; app_tagline: string; footer_text: string }

// Fallbacks only; real values come from the app_settings table (GET /api/v1/settings).
const DEFAULT_SETTINGS: SystemSettings = { app_name: 'SKDR INDONESIA', app_tagline: '', footer_text: 'SKDR Indonesia' }

const SettingsContext = createContext<{ settings: SystemSettings }>({ settings: DEFAULT_SETTINGS })

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS)
  useEffect(() => {
    fetch(`${API_BASE}/settings`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.success && j.data) setSettings((prev) => ({ ...prev, ...j.data })) })
      .catch(() => {})
  }, [])
  return <SettingsContext.Provider value={{ settings }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
