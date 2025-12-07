import { create } from 'zustand'
import { useSettingsStore, SETTING_KEYS } from './settings'

type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

type ClipboardItem = {
  type: string
  content?: string
  file_path?: string
  metadata?: Record<string, unknown>
}

interface NoteFilesState {
  tree: DirEntry[]
  isLoading: boolean
  error: string | null
  listDir: (dir?: string) => Promise<void>
  listDirRaw: (dir: string) => Promise<DirEntry[]>
  readFile: (filePath: string) => Promise<string | null>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  appendToFile: (filePath: string, content: string) => Promise<boolean>
  ensureDir: (dirPath: string) => Promise<boolean>
  deletePath: (targetPath: string) => Promise<boolean>
  renamePath: (fromPath: string, toPath: string) => Promise<boolean>
  saveImageToAttachments: (baseDir: string, data: string | Blob, suggestedName?: string) => Promise<string | null>
  getDefaultDir: () => string
  setDefaultDir: (dirPath: string) => Promise<boolean>
  getDefaultFile: () => string
  setDefaultFile: (filePath: string) => Promise<boolean>
  saveClipboardItemToDefaultMd: (item: ClipboardItem) => Promise<boolean>
}

function joinPath(a: string, b: string) {
  if (!a) return b
  const sep = a.includes('\\') ? '\\' : '/'
  return a.replace(new RegExp(`${sep}$`), '') + sep + b
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${y}${m}${dd}-${hh}${mm}${ss}`
}

function sanitizeBase(name: string) {
  return name.replace(/[<>:"/\\|?*\n\r\t]/g, '').replace(/\s+/g, '_')
}

export const useNoteFilesStore = create<NoteFilesState>()((set, get) => ({
  tree: [],
  isLoading: false,
  error: null,

  listDir: async (dir?: string) => {
    const dirPath = dir || useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, '')
    if (!dirPath) {
      set({ error: '未设置默认目录' })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const res = await window.electronAPI.listDir(dirPath)
      if (res && res.success) {
        set({ tree: res.data || [], isLoading: false })
      } else {
        set({ error: res?.error || '目录读取失败', isLoading: false })
      }
    } catch {
      set({ error: '目录读取失败', isLoading: false })
    }
  },

  listDirRaw: async (dir: string) => {
    try {
      const res = await window.electronAPI.listDir(dir)
      if (res && res.success) return res.data || []
      return []
    } catch {
      return []
    }
  },

  readFile: async (filePath: string) => {
    try {
      const res = await window.electronAPI.readTextFile(filePath)
      if (res && res.success) return res.data || ''
      return null
    } catch {
      return null
    }
  },

  writeFile: async (filePath: string, content: string) => {
    try {
      const res = await window.electronAPI.writeTextFile(filePath, content)
      return !!res && !!res.success
    } catch {
      return false
    }
  },

  appendToFile: async (filePath: string, content: string) => {
    try {
      const res = await window.electronAPI.appendTextFile(filePath, content)
      return !!res && !!res.success
    } catch {
      return false
    }
  },

  ensureDir: async (dirPath: string) => {
    try {
      const res = await window.electronAPI.ensureDir(dirPath)
      return !!res && !!res.success
    } catch {
      return false
    }
  },

  deletePath: async (targetPath: string) => {
    try {
      const res = await window.electronAPI.deletePath(targetPath)
      return !!res && !!res.success
    } catch {
      return false
    }
  },

  renamePath: async (fromPath: string, toPath: string) => {
    try {
      const res = await window.electronAPI.renamePath(fromPath, toPath)
      return !!res && !!res.success
    } catch {
      return false
    }
  },

  saveImageToAttachments: async (baseDir: string, data: string | Blob, suggestedName?: string) => {
    try {
      const attachDir = joinPath(baseDir, 'attachments')
      await get().ensureDir(attachDir)
      const ext = (typeof data !== 'string'
        ? ((data as Blob).type && (data as Blob).type.startsWith('image/') ? (data as Blob).type.split('/')[1] : 'png')
        : (data.startsWith('data:image/') ? data.split(';')[0].split('/')[1] : 'png')) || 'png'
      const base = suggestedName && suggestedName.trim().length > 0 ? sanitizeBase(suggestedName.trim()) : ''
      const name = base ? `${base}-${nowStamp()}.${ext}` : `${nowStamp()}.${ext}`
      const filePath = joinPath(attachDir, name)
      if (typeof data !== 'string' && window.electronAPI?.saveBytesFile) {
        const ab = await (data as Blob).arrayBuffer()
        const bytes = new Uint8Array(ab)
        const res = await window.electronAPI.saveBytesFile(filePath, bytes)
        if (res && res.success) {
          const rel = `attachments/${name}`
          return rel
        }
        return null
      }
      const dataUrl = typeof data === 'string' ? data : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read-error'))
        reader.readAsDataURL(data as Blob)
      })
      const res = await window.electronAPI.saveBase64File(filePath, dataUrl)
      if (res && res.success) {
        const rel = `attachments/${name}`
        return rel
      }
      return null
    } catch {
      return null
    }
  },

  getDefaultDir: () => {
    const fromSettings = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, '')
    if (fromSettings && typeof fromSettings === 'string' && fromSettings.length > 0) return fromSettings
    try {
      const local = localStorage.getItem('xpaste-notebook-default-dir') || ''
      return local
    } catch {
      return ''
    }
  },

  setDefaultDir: async (dirPath: string) => {
    try {
      try { localStorage.setItem('xpaste-notebook-default-dir', dirPath) } catch {}
      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, dirPath)
      const df = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, '')
      if (!df) {
        const p = joinPath(dirPath, 'default.md')
        try { localStorage.setItem('xpaste-notebook-default-file', p) } catch {}
        await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, p)
      }
      return true
    } catch {
      try { localStorage.setItem('xpaste-notebook-default-dir', dirPath) } catch {}
      return false
    }
  },

  getDefaultFile: () => {
    const df = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, '')
    if (df) return df
    let dir = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, '')
    if (!dir) {
      try { dir = localStorage.getItem('xpaste-notebook-default-dir') || '' } catch {}
    }
    if (!dir) return ''
    const fallback = joinPath(dir, 'default.md')
    try {
      const localFile = localStorage.getItem('xpaste-notebook-default-file')
      return localFile || fallback
    } catch {
      return fallback
    }
  },

  setDefaultFile: async (filePath: string) => {
    try {
      try { localStorage.setItem('xpaste-notebook-default-file', filePath) } catch {}
      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, filePath)
      return true
    } catch {
      try { localStorage.setItem('xpaste-notebook-default-file', filePath) } catch {}
      return false
    }
  },

  saveClipboardItemToDefaultMd: async (item: ClipboardItem) => {
    try {
      const filePath = get().getDefaultFile()
      if (!filePath) return false
      const d = new Date()
      const ts = d.toISOString().replace('T', ' ').slice(0, 19)
      let content = ''
      if (item.type === 'text' && item.content) {
        content = `\n\n${ts}\n\n${item.content}\n`
      } else if (item.type === 'image' && item.content) {
        const dir = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, '')
        if (!dir) return false
        const filePath = get().getDefaultFile()
        const base = filePath ? filePath.split(filePath.includes('\\') ? '\\' : '/').pop()?.replace(/\.md$/i, '') || '' : ''
        const rel = await get().saveImageToAttachments(dir, item.content, base)
        if (!rel) return false
        content = `\n\n${ts}\n\n![](${rel})\n`
      } else {
        return false
      }
      const ok = await get().appendToFile(filePath, content)
      return ok
    } catch {
      return false
    }
  },
}))
