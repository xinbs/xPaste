import { create } from 'zustand'
import { useSettingsStore, SETTING_KEYS } from './settings'
import apiClient from '@/lib/api'

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
  syncNoteFile: (filePath: string, rootDir?: string) => Promise<boolean>
  syncAllNotes: (rootDir?: string) => Promise<{ pushed: number; failed: number }>
  syncAttachmentsForDir: (dir: string, rootDir?: string) => Promise<{ uploaded: number; failed: number }>
  syncAllAttachments: (rootDir?: string) => Promise<{ uploaded: number; failed: number }>
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function joinPath(a: string, b: string) {
  if (!a) return b
  const sep = a.includes('\\') ? '\\' : '/'
  const esc = escapeRe(sep)
  return a.replace(new RegExp(`${esc}$`), '') + sep + b
}
function sepOf(p: string) { return p.includes('\\') ? '\\' : '/' }
function relativeDir(root: string, dir: string) {
  if (!root || !dir) return ''
  const rs = sepOf(root)
  const ds = sepOf(dir)
  const norm = (p: string, s: string) => {
    const esc = escapeRe(s)
    return p.replace(new RegExp(`${esc}+`, 'g'), s).replace(new RegExp(`${esc}$`), '')
  }
  const R = norm(root, rs)
  const D = norm(dir, ds)
  if (D.startsWith(R)) {
    const rel = D.slice(R.length)
    const esc = escapeRe(ds)
    return rel.replace(new RegExp(`^${esc}`), '')
  }
  return ''
}
function toUnix(p: string) { return p.replace(/\\/g, '/') }
function guessMimeFromName(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

function simpleHashString(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i)
  return String(h >>> 0)
}

function loadSyncIndex() {
  try {
    const raw = localStorage.getItem('xpaste-sync-index')
    if (!raw) return { notes: {}, attachments: {} } as { notes: Record<string, string>; attachments: Record<string, string> }
    const obj = JSON.parse(raw)
    return { notes: obj.notes || {}, attachments: obj.attachments || {} } as { notes: Record<string, string>; attachments: Record<string, string> }
  } catch {
    return { notes: {}, attachments: {} } as { notes: Record<string, string>; attachments: Record<string, string> }
  }
}

function saveSyncIndex(idx: { notes: Record<string, string>; attachments: Record<string, string> }) {
  try { localStorage.setItem('xpaste-sync-index', JSON.stringify(idx)) } catch {}
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

function localTimeStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${y}-${m}-${dd} ${hh}:${mm}:${ss}`
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
      const ts = localTimeStamp()
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

        try {
          const syncEnabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
          if (syncEnabled && typeof window.electronAPI.readBytesFile === 'function') {
            const abs = joinPath(dir, rel)
            const read = await window.electronAPI.readBytesFile(abs)
            if (read && read.success && read.data) {
              const fileName = rel.split('/').pop() || `image-${Date.now()}.png`
              const noteDir = ''
              const pathRel = 'attachments'
              const typeGuess = (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) ? 'image/jpeg'
                : fileName.toLowerCase().endsWith('.png') ? 'image/png'
                : fileName.toLowerCase().endsWith('.webp') ? 'image/webp'
                : 'application/octet-stream'
              const blobU = new Blob([read.data], { type: typeGuess })
              await apiClient.uploadNotebookAttachment(blobU, { filename: fileName, noteDir, pathRel, useData: true })
            }
          }
        } catch {}
      } else {
        return false
      }
      const ok = await get().appendToFile(filePath, content)
      return ok
    } catch {
      return false
    }
  },

  syncNoteFile: async (filePath: string, rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      if (!enabled) return false
      const content = await get().readFile(filePath)
      if (content === null) return false
      const dir = filePath.split(sepOf(filePath)).slice(0, -1).join(sepOf(filePath))
      const root = rootDir || get().getDefaultDir()
      const noteDir = relativeDir(root, dir)
      const fileName = filePath.split(sepOf(filePath)).pop() || 'note.md'
      const key = toUnix(noteDir ? `${noteDir}/${fileName}` : fileName)
      const idx = loadSyncIndex()
      const hash = simpleHashString(content)
      if (idx.notes[key] === hash) return true
      const res = await apiClient.pushNotebookNote(content, { filename: fileName, noteDir, useData: true })
      if (res && res.success) {
        idx.notes[key] = hash
        saveSyncIndex(idx)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  syncAllNotes: async (rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      if (!enabled) return { pushed: 0, failed: 0 }
      const root = rootDir || get().getDefaultDir()
      if (!root) return { pushed: 0, failed: 0 }
      const walk = async (dir: string, acc: string[]): Promise<string[]> => {
        const entries = await get().listDirRaw(dir)
        const files = entries.filter(e => e.isFile && e.name.toLowerCase().endsWith('.md')).map(e => e.path)
        const subdirs = entries.filter(e => e.isDirectory).map(e => e.path)
        acc.push(...files)
        for (const sd of subdirs) {
          await walk(sd, acc)
        }
        return acc
      }
      const allFiles = await walk(root, [])
      const idx = loadSyncIndex()
      const items: { content: string; filename: string; note_dir?: string; use_data?: boolean }[] = []
      const keyHashMap: Record<string, string> = {}
      for (const fp of allFiles) {
        const content = await get().readFile(fp)
        if (content === null) continue
        const dir = fp.split(sepOf(fp)).slice(0, -1).join(sepOf(fp))
        const noteDir = relativeDir(root, dir)
        const fileName = fp.split(sepOf(fp)).pop() || 'note.md'
        const key = toUnix(noteDir ? `${noteDir}/${fileName}` : fileName)
        const hash = simpleHashString(content)
        if (idx.notes[key] !== hash) {
          items.push({ content, filename: fileName, note_dir: noteDir || '', use_data: true })
          keyHashMap[key] = hash
        }
      }
      if (items.length === 0) return { pushed: 0, failed: 0 }
      const res = await apiClient.pushNotebookNotesBatch(items)
      const results = (res && res.success && res.data && Array.isArray(res.data.results)) ? res.data.results as any[] : []
      const pushed = results.filter(r => r && r.success).length
      const failed = results.length > 0 ? results.filter(r => r && !r.success).length : 0
      if (pushed > 0) {
        for (const r of results) {
          if (r && r.success) {
            const key = toUnix(r.NoteDir ? `${r.NoteDir}/${r.FileName}` : r.FileName)
            const h = keyHashMap[key]
            if (h) idx.notes[key] = h
          }
        }
        saveSyncIndex(idx)
      }
      return { pushed, failed }
    } catch {
      return { pushed: 0, failed: 0 }
    }
  },

  syncAttachmentsForDir: async (dir: string, rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      if (!enabled) return { uploaded: 0, failed: 0 }
      const root = rootDir || get().getDefaultDir()
      const noteDir = relativeDir(root, dir)
      const attRoot = joinPath(dir, 'attachments')
      const exists = await get().listDirRaw(attRoot)
      if (!exists || exists.length === 0) return { uploaded: 0, failed: 0 }

      const collect = async (d: string, acc: string[]): Promise<string[]> => {
        const ents = await get().listDirRaw(d)
        for (const e of ents) {
          if (e.isFile) acc.push(e.path)
          else if (e.isDirectory) await collect(e.path, acc)
        }
        return acc
      }
      const files = await collect(attRoot, [])
      let uploaded = 0
      let failed = 0
      for (const abs of files) {
        try {
          const read = await window.electronAPI.readBytesFile(abs)
          if (!read || !read.success || !read.data) { failed++; continue }
          const fileName = abs.split(sepOf(abs)).pop() || `file-${Date.now()}`
          const relWithin = toUnix(abs).slice(toUnix(attRoot).length).replace(/^\//, '')
          const relDirWithin = relWithin.split('/').slice(0, -1).join('/')
          const pathRel = relDirWithin ? `attachments/${relDirWithin}` : 'attachments'
          const blobU = new Blob([read.data], { type: guessMimeFromName(fileName) })
          await apiClient.uploadNotebookAttachment(blobU, { filename: fileName, noteDir, pathRel, useData: true })
          uploaded++
        } catch {
          failed++
        }
      }
      return { uploaded, failed }
    } catch {
      return { uploaded: 0, failed: 0 }
    }
  },

  syncAllAttachments: async (rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      if (!enabled) return { uploaded: 0, failed: 0 }
      const root = rootDir || get().getDefaultDir()
      if (!root) return { uploaded: 0, failed: 0 }
      const walkDirs = async (d: string, acc: string[]): Promise<string[]> => {
        const ents = await get().listDirRaw(d)
        acc.push(d)
        const subs = ents.filter(e => e.isDirectory).map(e => e.path)
        for (const sd of subs) {
          await walkDirs(sd, acc)
        }
        return acc
      }
      const allDirs = await walkDirs(root, [])
      let uploaded = 0
      let failed = 0
      for (const d of allDirs) {
        const r = await get().syncAttachmentsForDir(d, root)
        uploaded += r.uploaded
        failed += r.failed
      }
      return { uploaded, failed }
    } catch {
      return { uploaded: 0, failed: 0 }
    }
  },
}))
