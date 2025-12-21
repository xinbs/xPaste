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
  pullAllNotes: (rootDir?: string) => Promise<{ downloaded: number; updated: number; conflicted: number; skipped: number; failed: number }>
  pullNoteChanges: (rootDir?: string) => Promise<{ downloaded: number; updated: number; conflicted: number; skipped: number; failed: number }>
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
  const rootUnix = toUnix(root).replace(/\/+/g, '/').replace(/\/$/, '')
  const dirUnix = toUnix(dir).replace(/\/+/g, '/').replace(/\/$/, '')
  const isWin = root.includes('\\') || root.includes(':') || dir.includes('\\') || dir.includes(':')
  const rootCmp = isWin ? rootUnix.toLowerCase() : rootUnix
  const dirCmp = isWin ? dirUnix.toLowerCase() : dirUnix
  if (dirCmp === rootCmp) return ''
  if (!dirCmp.startsWith(rootCmp + '/')) return ''
  return dirUnix.slice(rootUnix.length + 1)
}
function toUnix(p: string) { return p.replace(/\\/g, '/') }
function joinPathUnix(base: string, relUnix: string) {
  const parts = toUnix(relUnix).split('/').filter(Boolean)
  let cur = base
  for (const part of parts) cur = joinPath(cur, part)
  return cur
}
function canonPathForCompare(p: string) {
  const u = toUnix(p).replace(/\/+/g, '/').replace(/\/$/, '')
  if (p.includes('\\') || p.includes(':')) return u.toLowerCase()
  return u
}
function isSubPath(filePath: string, dirPath: string) {
  if (!filePath || !dirPath) return false
  const f = canonPathForCompare(filePath)
  const d = canonPathForCompare(dirPath)
  return f === d ? false : f.startsWith(d.endsWith('/') ? d : d + '/')
}
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

type SyncIndex = {
  notes: Record<string, string>
  attachments: Record<string, string>
  notesMeta: Record<string, { mtimeMs: number; sizeBytes: number; localEditAtMs?: number }>
  notesCursor: number
  notesBaselineDone: boolean
}

function loadSyncIndex() {
  try {
    const raw = localStorage.getItem('xpaste-sync-index')
    if (!raw) return { notes: {}, attachments: {}, notesMeta: {}, notesCursor: 0, notesBaselineDone: false } as SyncIndex
    const obj = JSON.parse(raw)
    const notesMeta = (obj && typeof obj === 'object' && obj !== null && 'notesMeta' in obj && obj.notesMeta && typeof obj.notesMeta === 'object')
      ? obj.notesMeta
      : (obj && typeof obj === 'object' && obj !== null && 'notes_meta' in obj && obj.notes_meta && typeof obj.notes_meta === 'object') ? obj.notes_meta : {}
    const cursor = (obj && typeof obj === 'object' && obj !== null && 'notesCursor' in obj && Number.isFinite(Number(obj.notesCursor)))
      ? Number(obj.notesCursor)
      : (obj && typeof obj === 'object' && obj !== null && 'notes_cursor' in obj && Number.isFinite(Number(obj.notes_cursor))) ? Number(obj.notes_cursor) : 0
    const baselineDone = (obj && typeof obj === 'object' && obj !== null && 'notesBaselineDone' in obj) ? !!obj.notesBaselineDone
      : (obj && typeof obj === 'object' && obj !== null && 'notes_baseline_done' in obj) ? !!obj.notes_baseline_done : false
    return { notes: obj.notes || {}, attachments: obj.attachments || {}, notesMeta: notesMeta || {}, notesCursor: cursor || 0, notesBaselineDone: baselineDone } as SyncIndex
  } catch {
    return { notes: {}, attachments: {}, notesMeta: {}, notesCursor: 0, notesBaselineDone: false } as SyncIndex
  }
}

function saveSyncIndex(idx: SyncIndex) {
  try { localStorage.setItem('xpaste-sync-index', JSON.stringify(idx)) } catch { void 0 }
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

function withConflictSuffix(absPath: string, suffix: string) {
  const sep = sepOf(absPath)
  const parts = absPath.split(sep)
  const name = parts.pop() || ''
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const nextName = `${base} (${suffix})${ext || '.md'}`
  const parent = parts.join(sep)
  return parent ? joinPath(parent, nextName) : nextName
}

function parseCloudNotePath(itemPath: string) {
  const p = toUnix(String(itemPath || '')).replace(/\/+/g, '/').replace(/^\/+/, '')
  if (!p) return null as null | { noteDir: string; filename: string }
  const marker = '/users/'
  const idx = p.toLowerCase().indexOf(marker)
  const tail = idx >= 0 ? p.slice(idx + marker.length) : p
  const tailParts = tail.split('/').filter(Boolean)
  if (idx >= 0) {
    if (tailParts.length <= 1) return null
    tailParts.shift()
  }
  if (tailParts.length === 0) return null
  const filename = tailParts.pop() || ''
  if (!filename) return null
  const noteDir = tailParts.join('/')
  return { noteDir, filename }
}

function parseNoteKey(noteKey: string) {
  const p = toUnix(String(noteKey || '')).replace(/\/+/g, '/').replace(/^\/+/, '')
  if (!p) return null as null | { noteDir: string; filename: string; relKey: string }
  const parts = p.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const filename = parts.pop() || ''
  if (!filename) return null
  const noteDir = parts.join('/')
  const relKey = toUnix(noteDir ? `${noteDir}/${filename}` : filename)
  return { noteDir, filename, relKey }
}

function parentPath(p: string) {
  if (!p) return ''
  const sep = sepOf(p)
  const parts = p.split(sep)
  parts.pop()
  return parts.join(sep)
}

function markLocalEdit(idx: SyncIndex, absPath: string, rootDir: string) {
  if (!absPath || !rootDir) return
  if (!isSubPath(absPath, rootDir)) return
  if (!absPath.toLowerCase().endsWith('.md')) return
  const dir = parentPath(absPath)
  const noteDir = relativeDir(rootDir, dir)
  const fileName = absPath.split(sepOf(absPath)).pop() || 'note.md'
  const key = toUnix(noteDir ? `${noteDir}/${fileName}` : fileName)
  const prev = idx.notesMeta[key]
  idx.notesMeta[key] = {
    mtimeMs: prev?.mtimeMs || 0,
    sizeBytes: prev?.sizeBytes || 0,
    localEditAtMs: Date.now(),
  }
}

export const useNoteFilesStore = create<NoteFilesState>()((set, get) => ({
  tree: [],
  isLoading: false,
  error: null,

  listDir: async (dir?: string) => {
    const dirPath = dir || get().getDefaultDir()
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
      const ok = !!res && !!res.success
      if (ok) {
        const root = get().getDefaultDir()
        if (root) {
          const idx = loadSyncIndex()
          markLocalEdit(idx, filePath, root)
          saveSyncIndex(idx)
        }
      }
      return ok
    } catch {
      return false
    }
  },

  appendToFile: async (filePath: string, content: string) => {
    try {
      const res = await window.electronAPI.appendTextFile(filePath, content)
      const ok = !!res && !!res.success
      if (ok) {
        const root = get().getDefaultDir()
        if (root) {
          const idx = loadSyncIndex()
          markLocalEdit(idx, filePath, root)
          saveSyncIndex(idx)
        }
      }
      return ok
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
      const ok = !!res && !!res.success
      if (ok) {
        const root = get().getDefaultDir()
        if (root && isSubPath(toPath, root) && toPath.toLowerCase().endsWith('.md')) {
          const idx = loadSyncIndex()
          const fromDir = parentPath(fromPath)
          const toDir = parentPath(toPath)
          const fromNoteDir = relativeDir(root, fromDir)
          const toNoteDir = relativeDir(root, toDir)
          const fromFile = fromPath.split(sepOf(fromPath)).pop() || 'note.md'
          const toFile = toPath.split(sepOf(toPath)).pop() || 'note.md'
          const fromKey = toUnix(fromNoteDir ? `${fromNoteDir}/${fromFile}` : fromFile)
          const toKey = toUnix(toNoteDir ? `${toNoteDir}/${toFile}` : toFile)
          if (fromKey !== toKey) {
            if (idx.notes[fromKey]) idx.notes[toKey] = idx.notes[fromKey]
            if (idx.notesMeta[fromKey]) idx.notesMeta[toKey] = idx.notesMeta[fromKey]
            delete idx.notes[fromKey]
            delete idx.notesMeta[fromKey]
            saveSyncIndex(idx)
          }
        }
      }
      return ok
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
    try {
      const local = localStorage.getItem('xpaste-notebook-default-dir') || ''
      if (local) return local
    } catch {
      return ''
    }
    const fromSettings = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, '') as string
    if (fromSettings && typeof fromSettings === 'string' && fromSettings.length > 0) return fromSettings
    return ''
  },

  setDefaultDir: async (dirPath: string) => {
    try {
      try { localStorage.setItem('xpaste-notebook-default-dir', dirPath) } catch { void 0 }
      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, dirPath)
      const df = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, '') as string
      if (!df || !isSubPath(df, dirPath)) {
        const p = joinPath(dirPath, 'default.md')
        try { localStorage.setItem('xpaste-notebook-default-file', p) } catch { void 0 }
        await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, p)
      }
      return true
    } catch {
      try { localStorage.setItem('xpaste-notebook-default-dir', dirPath) } catch { void 0 }
      try {
        const p = joinPath(dirPath, 'default.md')
        localStorage.setItem('xpaste-notebook-default-file', p)
      } catch { void 0 }
      return false
    }
  },

  getDefaultFile: () => {
    const df = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, '') as string
    let dir = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_DIR, '') as string
    if (!dir) {
      try { dir = localStorage.getItem('xpaste-notebook-default-dir') || '' } catch { void 0 }
    }
    if (df) {
      if (dir && isSubPath(df, dir)) return df
      if (!dir) return df
    }
    if (!dir) return ''
    const fallback = joinPath(dir, 'default.md')
    try {
      const localFile = localStorage.getItem('xpaste-notebook-default-file')
      if (localFile && isSubPath(localFile, dir)) return localFile
      return fallback
    } catch {
      return fallback
    }
  },

  setDefaultFile: async (filePath: string) => {
    try {
      try { localStorage.setItem('xpaste-notebook-default-file', filePath) } catch { void 0 }
      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_DEFAULT_FILE, filePath)
      return true
    } catch {
      try { localStorage.setItem('xpaste-notebook-default-file', filePath) } catch { void 0 }
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
        const dir = get().getDefaultDir()
        if (!dir) return false
        const filePath = get().getDefaultFile()
        const base = filePath ? filePath.split(filePath.includes('\\') ? '\\' : '/').pop()?.replace(/\.md$/i, '') || '' : ''
        const rel = await get().saveImageToAttachments(dir, item.content, base)
        if (!rel) return false
        content = `\n\n${ts}\n\n![](${rel})\n`

        try {
          const syncEnabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
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
              const u8 = new Uint8Array(read.data as unknown as ArrayBuffer)
              const buf = (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
              const blobU = new Blob([buf], { type: typeGuess })
              await apiClient.uploadNotebookAttachment(blobU, { filename: fileName, noteDir, pathRel, useData: true })
            }
          }
        } catch { void 0 }
      } else {
        return false
      }
      const ok = await get().appendToFile(filePath, content)
      return ok
    } catch {
      return false
    }
  },

  pullAllNotes: async (rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) return { downloaded: 0, updated: 0, conflicted: 0, skipped: 0, failed: 0 }
      const root = rootDir || get().getDefaultDir()
      if (!root) return { downloaded: 0, updated: 0, conflicted: 0, skipped: 0, failed: 0 }

      const list = await apiClient.listNotebookNotes({ useData: true })
      type CloudNoteMeta = { path: string; mtimeMs: number; sizeBytes: number }
      const metaRaw: unknown = (list && list.success) ? (list.data as unknown as { items_meta?: unknown }).items_meta : undefined
      const itemsRaw: unknown = (list && list.success) ? (list.data as unknown as { items?: unknown }).items : undefined
      const cloudItems: CloudNoteMeta[] = []
      if (Array.isArray(metaRaw)) {
        for (const it of metaRaw) {
          if (!it || typeof it !== 'object') continue
          const path = String((it as { path?: unknown }).path || '')
          if (!path) continue
          const mtimeMs = Number((it as { mtime_ms?: unknown }).mtime_ms || 0) || 0
          const sizeBytes = Number((it as { size_bytes?: unknown }).size_bytes || 0) || 0
          cloudItems.push({ path, mtimeMs, sizeBytes })
        }
      } else if (Array.isArray(itemsRaw)) {
        for (const it of itemsRaw) {
          const path = String(it || '')
          if (!path) continue
          cloudItems.push({ path, mtimeMs: 0, sizeBytes: 0 })
        }
      }
      if (cloudItems.some(x => x.mtimeMs > 0)) {
        cloudItems.sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.path.localeCompare(b.path))
      }

      const idx = loadSyncIndex()
      let downloaded = 0
      let updated = 0
      let conflicted = 0
      let skipped = 0
      let failed = 0

      for (const it of cloudItems) {
        try {
          const parsed = parseCloudNotePath(it.path)
          if (!parsed) continue
          const relKey = toUnix(parsed.noteDir ? `${parsed.noteDir}/${parsed.filename}` : parsed.filename)
          const localAbs = joinPathUnix(root, relKey)
          const prevHash = idx.notes[relKey]
          const prevMeta = idx.notesMeta[relKey]
          const canUseMeta = it.mtimeMs > 0 || it.sizeBytes > 0

          const existsRes = await window.electronAPI.existsPath(localAbs)
          const exists = !!(existsRes && existsRes.success && existsRes.data)

          if (exists && canUseMeta && prevMeta && prevMeta.mtimeMs === it.mtimeMs && prevMeta.sizeBytes === it.sizeBytes) {
            if (!prevHash) {
              const localContent = await get().readFile(localAbs)
              if (localContent !== null) idx.notes[relKey] = simpleHashString(localContent)
            }
            skipped++
            continue
          }

          const note = await apiClient.getNotebookNote({ filename: parsed.filename, noteDir: parsed.noteDir, useData: true })
          const noteData: unknown = (note && note.success) ? note.data : undefined
          const rawContent = (typeof noteData === 'object' && noteData !== null && 'content' in noteData)
            ? (noteData as { content?: unknown }).content
            : undefined
          const content = rawContent !== undefined ? String(rawContent) : null
          if (content === null) { failed++; continue }
          const remoteHash = simpleHashString(content)

          if (exists) {
            const localContent = await get().readFile(localAbs)
            const localHash = localContent !== null ? simpleHashString(localContent) : ''

            if (localContent !== null && prevHash && localHash !== prevHash && remoteHash !== prevHash && remoteHash !== localHash) {
              const localEditAtMs = prevMeta?.localEditAtMs || 0
              const remoteEditAtMs = it.mtimeMs || 0

              if (remoteEditAtMs > 0 && localEditAtMs > 0 && remoteEditAtMs > localEditAtMs) {
                const conflictAbs = withConflictSuffix(localAbs, `conflict-local-${nowStamp()}`)
                const parent = conflictAbs.split(sepOf(conflictAbs)).slice(0, -1).join(sepOf(conflictAbs))
                if (parent) await get().ensureDir(parent)
                const ok = await get().writeFile(conflictAbs, localContent)
                if (!ok) { failed++; continue }

                const parent2 = localAbs.split(sepOf(localAbs)).slice(0, -1).join(sepOf(localAbs))
                if (parent2) await get().ensureDir(parent2)
                const ok2 = await get().writeFile(localAbs, content)
                if (!ok2) { failed++; continue }

                idx.notes[relKey] = remoteHash
                if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs: remoteEditAtMs }
                conflicted++
                updated++
                continue
              }

              const conflictAbs = withConflictSuffix(localAbs, `conflict-cloud-${nowStamp()}`)
              const parent = conflictAbs.split(sepOf(conflictAbs)).slice(0, -1).join(sepOf(conflictAbs))
              if (parent) await get().ensureDir(parent)
              const ok = await get().writeFile(conflictAbs, content)
              if (!ok) { failed++; continue }
              idx.notes[relKey] = localHash
              if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs }
              conflicted++
              continue
            }

            if (localContent !== null && remoteHash === localHash) {
              idx.notes[relKey] = remoteHash
              if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs: prevMeta?.localEditAtMs }
              skipped++
              continue
            }

            if (prevHash && localContent !== null && localHash !== prevHash && remoteHash !== localHash) {
              idx.notes[relKey] = localHash
              if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs: prevMeta?.localEditAtMs || Date.now() }
              skipped++
              continue
            }

            if (remoteHash !== localHash) {
              const parent = localAbs.split(sepOf(localAbs)).slice(0, -1).join(sepOf(localAbs))
              if (parent) await get().ensureDir(parent)
              const ok = await get().writeFile(localAbs, content)
              if (!ok) { failed++; continue }
              idx.notes[relKey] = remoteHash
              if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs: it.mtimeMs || prevMeta?.localEditAtMs }
              updated++
              continue
            }

            idx.notes[relKey] = remoteHash
            if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs: prevMeta?.localEditAtMs }
            skipped++
            continue
          }

          const parent = localAbs.split(sepOf(localAbs)).slice(0, -1).join(sepOf(localAbs))
          if (parent) await get().ensureDir(parent)
          const ok = await get().writeFile(localAbs, content)
          if (!ok) { failed++; continue }
          idx.notes[relKey] = remoteHash
          if (canUseMeta) idx.notesMeta[relKey] = { mtimeMs: it.mtimeMs, sizeBytes: it.sizeBytes, localEditAtMs: it.mtimeMs || 0 }
          downloaded++
        } catch {
          failed++
        }
      }
      saveSyncIndex(idx)
      return { downloaded, updated, conflicted, skipped, failed }
    } catch {
      return { downloaded: 0, updated: 0, conflicted: 0, skipped: 0, failed: 0 }
    }
  },

  pullNoteChanges: async (rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) return { downloaded: 0, updated: 0, conflicted: 0, skipped: 0, failed: 0 }
      const root = rootDir || get().getDefaultDir()
      if (!root) return { downloaded: 0, updated: 0, conflicted: 0, skipped: 0, failed: 0 }

      const idx = loadSyncIndex()
      const since = Number.isFinite(idx.notesCursor) ? idx.notesCursor : 0

      const first = await apiClient.getNotebookNoteChanges({ since, limit: 2000, useData: true }).catch(() => null)
      const firstData: unknown = (first && first.success) ? first.data : undefined
      const firstMaxToken = (firstData && typeof firstData === 'object' && firstData !== null && 'max_token' in firstData)
        ? Number((firstData as { max_token?: unknown }).max_token || 0) || 0
        : 0

      let downloaded = 0
      let updated = 0
      let conflicted = 0
      let skipped = 0
      let failed = 0

      if (since <= 0 && !idx.notesBaselineDone) {
        const r = await get().pullAllNotes(root)
        downloaded += r.downloaded
        updated += r.updated
        conflicted += r.conflicted
        skipped += r.skipped
        failed += r.failed

        idx.notesBaselineDone = true
        idx.notesCursor = firstMaxToken > 0 ? firstMaxToken : idx.notesCursor
        saveSyncIndex(idx)
        if (idx.notesCursor > 0) {
          await apiClient.ackNotebookNoteChanges({ lastToken: idx.notesCursor, useData: true }).catch(() => null)
        }
      }

      const applyEvents = async (events: unknown[]) => {
        for (const ev of events) {
          try {
            if (!ev || typeof ev !== 'object') continue
            const noteKey = String((ev as { note_key?: unknown }).note_key || '')
            const eventType = String((ev as { event_type?: unknown }).event_type || '')
            if (eventType !== 'upsert') continue
            const parsed = parseNoteKey(noteKey)
            if (!parsed) continue

            const remoteMtimeMs = Number((ev as { mtime_ms?: unknown }).mtime_ms || 0) || 0
            const remoteSizeBytes = Number((ev as { size_bytes?: unknown }).size_bytes || 0) || 0
            const canUseMeta = remoteMtimeMs > 0 || remoteSizeBytes > 0

            const localAbs = joinPathUnix(root, parsed.relKey)
            const prevHash = idx.notes[parsed.relKey]
            const prevMeta = idx.notesMeta[parsed.relKey]

            const existsRes = await window.electronAPI.existsPath(localAbs)
            const exists = !!(existsRes && existsRes.success && existsRes.data)

            if (exists && canUseMeta && prevMeta && prevMeta.mtimeMs === remoteMtimeMs && prevMeta.sizeBytes === remoteSizeBytes) {
              skipped++
              continue
            }

            const note = await apiClient.getNotebookNote({ filename: parsed.filename, noteDir: parsed.noteDir, useData: true })
            const noteData: unknown = (note && note.success) ? note.data : undefined
            const rawContent = (typeof noteData === 'object' && noteData !== null && 'content' in noteData)
              ? (noteData as { content?: unknown }).content
              : undefined
            const content = rawContent !== undefined ? String(rawContent) : null
            if (content === null) { failed++; continue }
            const remoteHash = simpleHashString(content)

            if (exists) {
              const localContent = await get().readFile(localAbs)
              const localHash = localContent !== null ? simpleHashString(localContent) : ''

              if (localContent !== null && prevHash && localHash !== prevHash && remoteHash !== prevHash && remoteHash !== localHash) {
                const localEditAtMs = prevMeta?.localEditAtMs || 0
                const remoteEditAtMs = remoteMtimeMs || 0

                if (remoteEditAtMs > 0 && localEditAtMs > 0 && remoteEditAtMs > localEditAtMs) {
                  const conflictAbs = withConflictSuffix(localAbs, `conflict-local-${nowStamp()}`)
                  const parent = conflictAbs.split(sepOf(conflictAbs)).slice(0, -1).join(sepOf(conflictAbs))
                  if (parent) await get().ensureDir(parent)
                  const ok = await get().writeFile(conflictAbs, localContent)
                  if (!ok) { failed++; continue }

                  const parent2 = localAbs.split(sepOf(localAbs)).slice(0, -1).join(sepOf(localAbs))
                  if (parent2) await get().ensureDir(parent2)
                  const ok2 = await get().writeFile(localAbs, content)
                  if (!ok2) { failed++; continue }

                  idx.notes[parsed.relKey] = remoteHash
                  if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs: remoteEditAtMs }
                  conflicted++
                  updated++
                  continue
                }

                const conflictAbs = withConflictSuffix(localAbs, `conflict-cloud-${nowStamp()}`)
                const parent = conflictAbs.split(sepOf(conflictAbs)).slice(0, -1).join(sepOf(conflictAbs))
                if (parent) await get().ensureDir(parent)
                const ok = await get().writeFile(conflictAbs, content)
                if (!ok) { failed++; continue }
                idx.notes[parsed.relKey] = localHash
                if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs }
                conflicted++
                continue
              }

              if (localContent !== null && remoteHash === localHash) {
                idx.notes[parsed.relKey] = remoteHash
                if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs: prevMeta?.localEditAtMs }
                skipped++
                continue
              }

              if (prevHash && localContent !== null && localHash !== prevHash && remoteHash !== localHash) {
                idx.notes[parsed.relKey] = localHash
                if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs: prevMeta?.localEditAtMs || Date.now() }
                skipped++
                continue
              }

              if (remoteHash !== localHash) {
                const parent = localAbs.split(sepOf(localAbs)).slice(0, -1).join(sepOf(localAbs))
                if (parent) await get().ensureDir(parent)
                const ok = await get().writeFile(localAbs, content)
                if (!ok) { failed++; continue }
                idx.notes[parsed.relKey] = remoteHash
                if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs: remoteMtimeMs || prevMeta?.localEditAtMs }
                updated++
                continue
              }

              idx.notes[parsed.relKey] = remoteHash
              if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs: prevMeta?.localEditAtMs }
              skipped++
              continue
            }

            const parent = localAbs.split(sepOf(localAbs)).slice(0, -1).join(sepOf(localAbs))
            if (parent) await get().ensureDir(parent)
            const ok = await get().writeFile(localAbs, content)
            if (!ok) { failed++; continue }
            idx.notes[parsed.relKey] = remoteHash
            if (canUseMeta) idx.notesMeta[parsed.relKey] = { mtimeMs: remoteMtimeMs, sizeBytes: remoteSizeBytes, localEditAtMs: remoteMtimeMs || 0 }
            downloaded++
          } catch {
            failed++
          }
        }
      }

      let cursor = idx.notesCursor
      let hasMore = false
      if (firstData && typeof firstData === 'object' && firstData !== null) {
        const itemsRaw = (firstData as { items?: unknown }).items
        if (Array.isArray(itemsRaw)) await applyEvents(itemsRaw as unknown[])
        const nextToken = Number((firstData as { next_token?: unknown }).next_token || cursor) || cursor
        const maxToken = Number((firstData as { max_token?: unknown }).max_token || nextToken) || nextToken
        cursor = nextToken
        hasMore = cursor < maxToken
      }

      while (hasMore) {
        const res = await apiClient.getNotebookNoteChanges({ since: cursor, limit: 2000, useData: true }).catch(() => null)
        const data: unknown = (res && res.success) ? res.data : undefined
        if (!data || typeof data !== 'object') break
        const itemsRaw = (data as { items?: unknown }).items
        if (Array.isArray(itemsRaw)) await applyEvents(itemsRaw as unknown[])
        const nextToken = Number((data as { next_token?: unknown }).next_token || cursor) || cursor
        const maxToken = Number((data as { max_token?: unknown }).max_token || nextToken) || nextToken
        cursor = nextToken
        hasMore = cursor < maxToken && Array.isArray(itemsRaw) && (itemsRaw as unknown[]).length > 0
      }

      idx.notesCursor = cursor
      saveSyncIndex(idx)
      if (cursor > 0) await apiClient.ackNotebookNoteChanges({ lastToken: cursor, useData: true }).catch(() => null)

      return { downloaded, updated, conflicted, skipped, failed }
    } catch {
      return { downloaded: 0, updated: 0, conflicted: 0, skipped: 0, failed: 0 }
    }
  },

  syncNoteFile: async (filePath: string, rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) return false
      const content = await get().readFile(filePath)
      if (content === null) return false
      const dir = filePath.split(sepOf(filePath)).slice(0, -1).join(sepOf(filePath))
      const root = rootDir || get().getDefaultDir()
      if (!root) return false
      const noteDir = relativeDir(root, dir)
      const fileName = filePath.split(sepOf(filePath)).pop() || 'note.md'
      const key = toUnix(noteDir ? `${noteDir}/${fileName}` : fileName)
      const idx = loadSyncIndex()
      const localHash = simpleHashString(content)
      if (idx.notes[key] === localHash) return true

      const localEditAtMs = idx.notesMeta[key]?.localEditAtMs || 0
      const list = await apiClient.listNotebookNotes({ noteDir, useData: true })
      const metaRaw: unknown = (list && list.success) ? (list.data as unknown as { items_meta?: unknown }).items_meta : undefined
      let remoteMeta: { mtimeMs: number; sizeBytes: number } | null = null
      if (Array.isArray(metaRaw)) {
        for (const it of metaRaw) {
          if (!it || typeof it !== 'object') continue
          const path = String((it as { path?: unknown }).path || '')
          if (!path) continue
          const parsed = parseCloudNotePath(path)
          if (!parsed) continue
          const relKey = toUnix(parsed.noteDir ? `${parsed.noteDir}/${parsed.filename}` : parsed.filename)
          if (relKey !== key) continue
          const mtimeMs = Number((it as { mtime_ms?: unknown }).mtime_ms || 0) || 0
          const sizeBytes = Number((it as { size_bytes?: unknown }).size_bytes || 0) || 0
          remoteMeta = { mtimeMs, sizeBytes }
          break
        }
      }

      if (remoteMeta && remoteMeta.mtimeMs > localEditAtMs) {
        const note = await apiClient.getNotebookNote({ filename: fileName, noteDir, useData: true })
        const noteData: unknown = (note && note.success) ? note.data : undefined
        const rawContent = (typeof noteData === 'object' && noteData !== null && 'content' in noteData)
          ? (noteData as { content?: unknown }).content
          : undefined
        const remoteContent = rawContent !== undefined ? String(rawContent) : null
        if (remoteContent === null) return false
        const remoteHash = simpleHashString(remoteContent)

        if (remoteHash !== localHash) {
          const conflictAbs = withConflictSuffix(filePath, `conflict-local-${nowStamp()}`)
          const parent = conflictAbs.split(sepOf(conflictAbs)).slice(0, -1).join(sepOf(conflictAbs))
          if (parent) await get().ensureDir(parent)
          const ok = await get().writeFile(conflictAbs, content)
          if (!ok) return false

          const ok2 = await get().writeFile(filePath, remoteContent)
          if (!ok2) return false
        }

        idx.notes[key] = remoteHash
        idx.notesMeta[key] = { mtimeMs: remoteMeta.mtimeMs, sizeBytes: remoteMeta.sizeBytes, localEditAtMs: remoteMeta.mtimeMs }
        saveSyncIndex(idx)
        return true
      }

      const res = await apiClient.pushNotebookNote(content, { filename: fileName, noteDir, useData: true })
      if (!res || !res.success) return false
      idx.notes[key] = localHash
      const nowMs = Date.now()
      idx.notesMeta[key] = { mtimeMs: nowMs, sizeBytes: content.length, localEditAtMs: idx.notesMeta[key]?.localEditAtMs || nowMs }
      saveSyncIndex(idx)
      return true
    } catch {
      return false
    }
  },

  syncAllNotes: async (rootDir?: string) => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
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
      const rawResults: unknown = (res && res.success && res.data) ? (res.data as unknown as { results?: unknown }).results : undefined
      const results = Array.isArray(rawResults) ? rawResults : []
      const okCount = results.filter(r => typeof r === 'object' && r !== null && (r as { success?: unknown }).success === true).length
      const badCount = results.length > 0 ? results.filter(r => typeof r === 'object' && r !== null && (r as { success?: unknown }).success !== true).length : 0
      const pushed = okCount
      const failed = badCount
      if (pushed > 0) {
        for (const r of results) {
          if (typeof r === 'object' && r !== null && (r as { success?: unknown }).success === true) {
            const rr = r as { note_dir?: unknown; filename?: unknown }
            const noteDir = typeof rr.note_dir === 'string' ? rr.note_dir : ''
            const fileName = typeof rr.filename === 'string' ? rr.filename : ''
            if (!fileName) continue
            const key = toUnix(noteDir ? `${noteDir}/${fileName}` : fileName)
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
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
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
          const u8 = new Uint8Array(read.data as unknown as ArrayBuffer)
          const buf = (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
          const blobU = new Blob([buf], { type: guessMimeFromName(fileName) })
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
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
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
