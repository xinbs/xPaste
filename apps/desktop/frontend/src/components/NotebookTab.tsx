import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNoteFilesStore } from '@/store/noteFiles'
import { useSettingsStore, SETTING_KEYS } from '@/store/settings'
import apiClient from '@/lib/api'
import { useToastStore } from '@/store/toast'
import { FileText, FolderOpen, Save, RefreshCw, ArrowLeft, Folder as FolderIcon, Eye, Pencil, Sun, Moon, Search, ChevronUp, ChevronDown, ChevronRight, X, Plus, Star, Cloud, Trash2, Upload } from 'lucide-react'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { SearchQuery, setSearchQuery, findNext, findPrevious, highlightSelectionMatches } from '@codemirror/search'

const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const joinPath = (a: string, b: string) => {
  if (!a) return b
  const sep = sepOf(a)
  const esc = escapeRe(sep)
  return a.replace(new RegExp(`${esc}$`), '') + sep + b
}
const parentPath = (p: string) => {
  if (!p) return ''
  const sep = sepOf(p)
  const parts = p.split(sep)
  parts.pop()
  return parts.join(sep)
}
const relativeDir = (root: string, dir: string) => {
  if (!root || !dir) return ''
  const toUnix = (p: string) => p.replace(/\\/g, '/')
  const rootUnix = toUnix(root).replace(/\/+/g, '/').replace(/\/$/, '')
  const dirUnix = toUnix(dir).replace(/\/+/g, '/').replace(/\/$/, '')
  const isWin = root.includes('\\') || root.includes(':') || dir.includes('\\') || dir.includes(':')
  const rootCmp = isWin ? rootUnix.toLowerCase() : rootUnix
  const dirCmp = isWin ? dirUnix.toLowerCase() : dirUnix
  if (dirCmp === rootCmp) return ''
  if (!dirCmp.startsWith(rootCmp + '/')) return ''
  return dirUnix.slice(rootUnix.length + 1)
}
const joinPathUnix = (base: string, relUnix: string) => {
  const parts = String(relUnix || '').replace(/\\/g, '/').split('/').filter(Boolean)
  let cur = base
  for (const part of parts) cur = joinPath(cur, part)
  return cur
}
const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read-error'))
    reader.readAsDataURL(blob)
  })
}

type CloudTreeItem = { name: string; path: string; is_dir: boolean; size_bytes?: number; mtime_ms?: number }
type CloudTrashItem = { trash_id: string; original_path: string; deleted_at_ms: number; is_dir: boolean; size_bytes?: number; mtime_ms?: number }

const joinCloudRel = (dirRel: string, name: string) => {
  const d = String(dirRel || '').replace(/^\/+/, '').replace(/\/+$/, '')
  const n = String(name || '').replace(/^\/+/, '')
  if (!d) return n
  if (!n) return d
  return `${d}/${n}`
}
const parentCloudRel = (rel: string) => {
  const p = String(rel || '').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!p) return ''
  const parts = p.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}
const fmtBytes = (n: number | undefined) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(1)} GB`
}
const fmtTime = (ms: number | undefined) => {
  const v = typeof ms === 'number' && Number.isFinite(ms) ? ms : 0
  if (!v) return ''
  const d = new Date(v)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const bufToHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bufToHex(digest)
}

export default function NotebookTab() {
  const tree = useNoteFilesStore(s => s.tree)
  const isLoading = useNoteFilesStore(s => s.isLoading)
  const listDir = useNoteFilesStore(s => s.listDir)
  const listDirRaw = useNoteFilesStore(s => s.listDirRaw)
  const readFile = useNoteFilesStore(s => s.readFile)
  const writeFile = useNoteFilesStore(s => s.writeFile)
  const appendToFile = useNoteFilesStore(s => s.appendToFile)
  const saveImageToAttachments = useNoteFilesStore(s => s.saveImageToAttachments)
  const setDefaultDir = useNoteFilesStore(s => s.setDefaultDir)
  const setDefaultFile = useNoteFilesStore(s => s.setDefaultFile)
  const getDefaultDir = useNoteFilesStore(s => s.getDefaultDir)
  const getDefaultFile = useNoteFilesStore(s => s.getDefaultFile)

  const [currentDir, setCurrentDir] = useState('')
  const [currentFile, setCurrentFile] = useState('')
  const [content, setContent] = useState('')
  const contentRef = useRef(content)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [searchQuery, setSearch] = useState('')
  const [previewMatchIndex, setPreviewMatchIndex] = useState(0)
  const [previewMatchCount, setPreviewMatchCount] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useState<number>(288)
  const [showCreate, setShowCreate] = useState(false)
  const [newNoteName, setNewNoteName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showSyncMenu, setShowSyncMenu] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [childrenMap, setChildrenMap] = useState<Record<string, { entries: { name: string; path: string; isDirectory: boolean; isFile: boolean }[] }>>({})
  const [showCloudManager, setShowCloudManager] = useState(false)
  const [cloudTab, setCloudTab] = useState<'files' | 'trash'>('files')
  const [cloudPath, setCloudPath] = useState('')
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudItems, setCloudItems] = useState<CloudTreeItem[]>([])
  const [cloudTrash, setCloudTrash] = useState<CloudTrashItem[]>([])
  const [cloudSelectedPath, setCloudSelectedPath] = useState<string>('')
  const [cloudPreview, setCloudPreview] = useState<{ path: string; kind: 'text' | 'image' | 'binary'; text?: string; url?: string; sizeBytes?: number } | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const cloudPreviewUrlRef = useRef<string | null>(null)
  const [showManualSync, setShowManualSync] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncStats, setSyncStats] = useState<{ total: number; done: number; skipped: number; conflicted: number; failed: number }>({ total: 0, done: 0, skipped: 0, conflicted: 0, failed: 0 })
  const [syncLogs, setSyncLogs] = useState<string[]>([])
  const syncAbortRef = useRef(false)
  const syncConflictResolveRef = useRef<((action: 'skip' | 'force') => void) | null>(null)
  const [syncConflict, setSyncConflict] = useState<null | {
    direction: 'upload' | 'download'
    path: string
    local?: { sizeBytes: number; sha256?: string }
    remote?: { sizeBytes?: number; mtimeMs?: number; sha256?: string }
  }>(null)

  const syncEnabledSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean)
  const autoOnRefreshSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ON_REFRESH, true) as boolean)
  const autoNotesSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, true) as boolean)
  const autoAttSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, false) as boolean)
  const resizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWRef = useRef(288)
  const previewRef = useRef<HTMLDivElement>(null)
  const mdRef = useRef<MarkdownIt | null>(null)
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    const prev = cloudPreviewUrlRef.current
    const next = cloudPreview?.url || null
    if (prev && prev !== next) URL.revokeObjectURL(prev)
    cloudPreviewUrlRef.current = next
  }, [cloudPreview])

  const appendSyncLog = useCallback((msg: string) => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    setSyncLogs((prev) => [...prev.slice(-199), `[${t}] ${msg}`])
  }, [])

  const askSyncConflict = useCallback((payload: NonNullable<typeof syncConflict>) => {
    setSyncConflict(payload)
    return new Promise<'skip' | 'force'>((resolve) => {
      syncConflictResolveRef.current = resolve
    })
  }, [])

  const listLocalFilesRecursive = useCallback(async (rootDir: string) => {
    const excludedNames = new Set(['.xpaste-local-backups'])
    const out: { absPath: string; relPath: string }[] = []
    const walk = async (dirAbs: string) => {
      const entries = await listDirRaw(dirAbs)
      for (const e of entries) {
        if (e.name && excludedNames.has(e.name)) continue
        if (e.isDirectory) {
          await walk(e.path)
          continue
        }
        if (!e.isFile) continue
        const sep = sepOf(e.path)
        const parts = e.path.split(sep)
        const name = parts.pop() || ''
        const parent = parts.join(sep)
        const relDir = relativeDir(rootDir, parent)
        const relPath = relDir ? `${relDir}/${name}` : name
        out.push({ absPath: e.path, relPath: relPath.replace(/\\/g, '/').replace(/^\/+/, '') })
      }
    }
    await walk(rootDir)
    return out
  }, [listDirRaw])

  const backupLocalFileIfExists = useCallback(async (rootDir: string, targetAbs: string) => {
    if (!window.electronAPI) return
    const existsRes = await window.electronAPI.existsPath(targetAbs)
    if (!existsRes?.success || !existsRes.data) return
    const readRes = await window.electronAPI.readBytesFile(targetAbs)
    if (!readRes?.success || !readRes.data) return
    const bytes = readRes.data
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    const ts = `${date}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const relDir = relativeDir(rootDir, parentPath(targetAbs))
    const name = targetAbs.split(sepOf(targetAbs)).pop() || 'file'
    const baseDir = joinPath(rootDir, '.xpaste-local-backups')
    const datedDir = joinPath(baseDir, date)
    const dstDir = relDir ? joinPathUnix(datedDir, relDir) : datedDir
    await window.electronAPI.ensureDir(dstDir)
    const dstName = `${name}__${ts}.bak`
    const dstAbs = joinPath(dstDir, dstName)
    await window.electronAPI.saveBytesFile(dstAbs, bytes)
  }, [])

  const manualSyncUploadAllLocal = useCallback(async () => {
    if (!window.electronAPI) {
      useToastStore.getState().showError('不可用', '请在桌面应用模式下使用手动同步')
      return
    }
    const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
    if (!enabled) {
      useToastStore.getState().showError('未开启云同步', '请在设置中开启')
      return
    }
    const root = getDefaultDir()
    if (!root) {
      useToastStore.getState().showError('未设置目录', '请先选择记事本目录')
      return
    }
    setSyncRunning(true)
    syncAbortRef.current = false
    setSyncStats({ total: 0, done: 0, skipped: 0, conflicted: 0, failed: 0 })
    appendSyncLog('开始上传本地全部文件到云端')
    let total = 0
    let done = 0
    let skipped = 0
    let conflicted = 0
    let failed = 0
    try {
      const files = await listLocalFilesRecursive(root)
      total = files.length
      setSyncStats((s) => ({ ...s, total }))
      for (let i = 0; i < files.length; i++) {
        if (syncAbortRef.current) {
          appendSyncLog('已停止')
          break
        }
        const f = files[i]
        try {
          const readRes = await window.electronAPI.readBytesFile(f.absPath)
          if (!readRes?.success || !readRes.data) {
            failed += 1
            done += 1
            setSyncStats((s) => ({ ...s, failed: s.failed + 1, done: s.done + 1 }))
            appendSyncLog(`读取失败：${f.relPath}`)
            continue
          }
          const bytes = readRes.data
          const localHash = await sha256Hex(bytes)
          let remoteMeta: { sizeBytes?: number; mtimeMs?: number; sha256?: string } | undefined
          let remoteHash = ''
          try {
            const m = await apiClient.getCloudFileMeta({ path: f.relPath, useData: true })
            if (m && m.success && m.data) {
              remoteHash = typeof m.data.sha256 === 'string' ? m.data.sha256 : ''
              remoteMeta = {
                sizeBytes: typeof m.data.size_bytes === 'number' ? m.data.size_bytes : undefined,
                mtimeMs: typeof m.data.mtime_ms === 'number' ? m.data.mtime_ms : undefined,
                sha256: remoteHash || undefined,
              }
            }
          } catch { void 0 }

          if (remoteHash && remoteHash === localHash) {
            skipped += 1
            done += 1
            setSyncStats((s) => ({ ...s, skipped: s.skipped + 1, done: s.done + 1 }))
            appendSyncLog(`跳过（无变更）：${f.relPath}`)
            continue
          }

          if (remoteHash && remoteHash !== localHash) {
            conflicted += 1
            setSyncStats((s) => ({ ...s, conflicted: s.conflicted + 1 }))
            const action = await askSyncConflict({
              direction: 'upload',
              path: f.relPath,
              local: { sizeBytes: bytes.byteLength, sha256: localHash },
              remote: remoteMeta,
            })
            setSyncConflict(null)
            syncConflictResolveRef.current = null
            if (action === 'skip') {
              skipped += 1
              done += 1
              setSyncStats((s) => ({ ...s, skipped: s.skipped + 1, done: s.done + 1 }))
              appendSyncLog(`跳过（冲突）：${f.relPath}`)
              continue
            }
          }

          const blob = new Blob([bytes], { type: 'application/octet-stream' })
          const res = await apiClient.uploadCloudFile(blob, { path: f.relPath, mode: remoteHash ? 'force' : 'safe', useData: true })
          if (res && res.success) {
            done += 1
            setSyncStats((s) => ({ ...s, done: s.done + 1 }))
            appendSyncLog(`已上传：${f.relPath}`)
          } else {
            failed += 1
            done += 1
            setSyncStats((s) => ({ ...s, failed: s.failed + 1, done: s.done + 1 }))
            appendSyncLog(`上传失败：${f.relPath}`)
          }
        } catch (e) {
          failed += 1
          done += 1
          setSyncStats((s) => ({ ...s, failed: s.failed + 1, done: s.done + 1 }))
          appendSyncLog(`上传失败：${f.relPath}（${e instanceof Error ? e.message : '未知错误'}）`)
        }
      }
    } finally {
      setSyncRunning(false)
      useToastStore.getState().showSuccess('手动上传完成', `完成 ${done}/${total}${failed > 0 ? `，失败 ${failed}` : ''}${skipped > 0 ? `，跳过 ${skipped}` : ''}${conflicted > 0 ? `，冲突 ${conflicted}` : ''}`)
    }
  }, [appendSyncLog, askSyncConflict, getDefaultDir, listLocalFilesRecursive])

  const manualSyncDownloadAllCloud = useCallback(async () => {
    if (!window.electronAPI) {
      useToastStore.getState().showError('不可用', '请在桌面应用模式下使用手动同步')
      return
    }
    const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
    if (!enabled) {
      useToastStore.getState().showError('未开启云同步', '请在设置中开启')
      return
    }
    const root = getDefaultDir()
    if (!root) {
      useToastStore.getState().showError('未设置目录', '请先选择记事本目录')
      return
    }
    setSyncRunning(true)
    syncAbortRef.current = false
    setSyncStats({ total: 0, done: 0, skipped: 0, conflicted: 0, failed: 0 })
    appendSyncLog('开始从云端下载全部文件到本地')
    let total = 0
    let done = 0
    let skipped = 0
    let conflicted = 0
    let failed = 0
    try {
      const tree = await apiClient.getCloudFilesTree({ path: '', recursive: true, useData: true })
      const items = (tree && tree.success && tree.data && Array.isArray(tree.data.items)) ? tree.data.items : []
      const files = items.filter((it) => it && !it.is_dir && typeof it.path === 'string' && it.path)
      total = files.length
      setSyncStats((s) => ({ ...s, total }))
      for (let i = 0; i < files.length; i++) {
        if (syncAbortRef.current) {
          appendSyncLog('已停止')
          break
        }
        const relPath = String(files[i].path || '').replace(/^\/+/, '')
        try {
          const dl = await apiClient.downloadCloudFile({ path: relPath, useData: true })
          const bytes = new Uint8Array(dl.data)
          const remoteHash = await sha256Hex(bytes)
          const abs = joinPathUnix(root, relPath)
          const existsRes = await window.electronAPI.existsPath(abs)
          if (existsRes?.success && existsRes.data) {
            const readRes = await window.electronAPI.readBytesFile(abs)
            const localBytes = (readRes?.success && readRes.data) ? readRes.data : null
            if (localBytes) {
              const localHash = await sha256Hex(localBytes)
              if (localHash === remoteHash) {
                skipped += 1
                done += 1
                setSyncStats((s) => ({ ...s, skipped: s.skipped + 1, done: s.done + 1 }))
                appendSyncLog(`跳过（无变更）：${relPath}`)
                continue
              }
              conflicted += 1
              setSyncStats((s) => ({ ...s, conflicted: s.conflicted + 1 }))
              const action = await askSyncConflict({
                direction: 'download',
                path: relPath,
                local: { sizeBytes: localBytes.byteLength, sha256: localHash },
                remote: { sizeBytes: bytes.byteLength, mtimeMs: typeof dl.mtimeMs === 'number' ? dl.mtimeMs : undefined, sha256: remoteHash },
              })
              setSyncConflict(null)
              syncConflictResolveRef.current = null
              if (action === 'skip') {
                skipped += 1
                done += 1
                setSyncStats((s) => ({ ...s, skipped: s.skipped + 1, done: s.done + 1 }))
                appendSyncLog(`跳过（冲突）：${relPath}`)
                continue
              }
              await backupLocalFileIfExists(root, abs)
            }
          }
          await window.electronAPI.ensureDir(parentPath(abs))
          const w = await window.electronAPI.saveBytesFile(abs, bytes)
          if (w?.success) {
            done += 1
            setSyncStats((s) => ({ ...s, done: s.done + 1 }))
            appendSyncLog(`已下载：${relPath}`)
          } else {
            failed += 1
            done += 1
            setSyncStats((s) => ({ ...s, failed: s.failed + 1, done: s.done + 1 }))
            appendSyncLog(`写入失败：${relPath}`)
          }
        } catch (e) {
          failed += 1
          done += 1
          setSyncStats((s) => ({ ...s, failed: s.failed + 1, done: s.done + 1 }))
          appendSyncLog(`下载失败：${relPath}（${e instanceof Error ? e.message : '未知错误'}）`)
        }
      }
    } finally {
      setSyncRunning(false)
      useToastStore.getState().showSuccess('手动下载完成', `完成 ${done}/${total}${failed > 0 ? `，失败 ${failed}` : ''}${skipped > 0 ? `，跳过 ${skipped}` : ''}${conflicted > 0 ? `，冲突 ${conflicted}` : ''}`)
      try { useNoteFilesStore.getState().listDir(root) } catch { void 0 }
    }
  }, [appendSyncLog, askSyncConflict, backupLocalFileIfExists, getDefaultDir])

  useEffect(() => {
    if (!showCloudManager) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCloudManager(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCloudManager])

  useEffect(() => {
    const d = getDefaultDir()
    const f = getDefaultFile()
    setCurrentDir(d || '')
    setCurrentFile(f || '')
    if (d) listDir(d)
    if (f) {
      readFile(f).then((text) => setContent(text || ''))
    }
  }, [listDir, readFile, getDefaultDir, getDefaultFile])

  useEffect(() => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      const autoNotes = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, true) as boolean
      const autoAtt = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, false) as boolean
      const root = useNoteFilesStore.getState().getDefaultDir()
      if (enabled && root) {
        ;(async () => {
          const { downloaded, updated, conflicted, failed } = await useNoteFilesStore.getState().pullNoteChanges(root)
          if (downloaded > 0 || updated > 0 || conflicted > 0) {
            useNoteFilesStore.getState().listDir(root)
            const msg = [
              downloaded > 0 ? `下载 ${downloaded}` : '',
              updated > 0 ? `更新 ${updated}` : '',
              conflicted > 0 ? `冲突 ${conflicted}` : '',
              failed > 0 ? `失败 ${failed}` : '',
            ].filter(Boolean).join('，')
            useToastStore.getState().showSuccess('已从云端同步', msg || '无变更')
          } else if (failed > 0) {
            useToastStore.getState().showError('云端同步失败', `失败 ${failed} 个笔记`)
          }
        })().catch(() => { void 0 })
        if (autoNotes) useNoteFilesStore.getState().syncAllNotes(root).catch(() => { void 0 })
        if (autoAtt) useNoteFilesStore.getState().syncAllAttachments(root).catch(() => { void 0 })
      }
    } catch { void 0 }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = async () => {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) return
      const root = useNoteFilesStore.getState().getDefaultDir()
      if (!root) return
      const { downloaded, updated } = await useNoteFilesStore.getState().pullNoteChanges(root)
      if (downloaded > 0 || updated > 0) {
        useNoteFilesStore.getState().listDir(root)
      }
    }
    if (syncEnabledSetting) {
      timer = setInterval(() => { tick().catch(() => { void 0 }) }, 15000)
    }
    const onFocus = () => { tick().catch(() => { void 0 }) }
    window.addEventListener('focus', onFocus)
    return () => {
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [syncEnabledSetting])

  const loadCloudTree = useCallback(async (pathRel: string) => {
    setCloudLoading(true)
    try {
      const res = await apiClient.getCloudFilesTree({ path: pathRel || '', recursive: false, useData: true })
      if (res && res.success && res.data && Array.isArray(res.data.items)) {
        const items = res.data.items.slice().sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
          return a.name.localeCompare(b.name, 'zh-CN')
        })
        setCloudItems(items)
        setCloudPath(String(res.data.path || pathRel || ''))
      } else {
        useToastStore.getState().showError('加载云端目录失败', res?.message || '未知错误')
      }
    } catch (e) {
      useToastStore.getState().showError('加载云端目录失败', e instanceof Error ? e.message : '未知错误')
    } finally {
      setCloudLoading(false)
    }
  }, [])

  const loadCloudTrash = useCallback(async () => {
    setCloudLoading(true)
    try {
      const res = await apiClient.listCloudTrash({ useData: true })
      if (res && res.success && res.data && Array.isArray(res.data.items)) {
        const items = res.data.items.slice().sort((a, b) => (b.deleted_at_ms || 0) - (a.deleted_at_ms || 0))
        setCloudTrash(items)
      } else {
        useToastStore.getState().showError('加载回收站失败', res?.message || '未知错误')
      }
    } catch (e) {
      useToastStore.getState().showError('加载回收站失败', e instanceof Error ? e.message : '未知错误')
    } finally {
      setCloudLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!showCloudManager) return
    setCloudSelectedPath('')
    setCloudPreview(null)
    if (cloudTab === 'files') loadCloudTree(cloudPath || '')
    else loadCloudTrash()
  }, [showCloudManager, cloudTab, cloudPath, loadCloudTree, loadCloudTrash])

  const previewCloudFile = useCallback(async (pathRel: string) => {
    if (!pathRel) return
    setCloudSelectedPath(pathRel)
    setCloudPreview(null)
    setCloudLoading(true)
    try {
      const res = await apiClient.downloadCloudFile({ path: pathRel, useData: true })
      const sizeBytes = res?.sizeBytes || 0
      const lower = pathRel.toLowerCase()
      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)
      if (isImage) {
        const blob = new Blob([res.data], { type: lower.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        setCloudPreview({ path: pathRel, kind: 'image', url, sizeBytes })
        return
      }

      const isText = /\.(md|txt|json|js|ts|css|html|xml|yml|yaml|log|csv)$/.test(lower)
      if (isText && sizeBytes <= 2 * 1024 * 1024) {
        const text = new TextDecoder('utf-8').decode(new Uint8Array(res.data))
        setCloudPreview({ path: pathRel, kind: 'text', text, sizeBytes })
        return
      }

      setCloudPreview({ path: pathRel, kind: 'binary', sizeBytes })
    } catch (e) {
      useToastStore.getState().showError('预览失败', e instanceof Error ? e.message : '未知错误')
    } finally {
      setCloudLoading(false)
    }
  }, [])

  const uploadCloudFromFile = useCallback(async (file: File) => {
    try {
      const target = joinCloudRel(cloudPath || '', file.name)
      const res = await apiClient.uploadCloudFile(file, { path: target, mode: 'safe', useData: true })
      if (res && res.success) {
        useToastStore.getState().showSuccess('上传成功', file.name)
        await loadCloudTree(cloudPath || '')
      } else if (res && !res.success && String(res.message || '').toLowerCase().includes('conflict')) {
        const force = window.confirm('云端已存在同名文件，强制上传会先备份旧文件。\n是否继续？')
        if (!force) return
        const res2 = await apiClient.uploadCloudFile(file, { path: target, mode: 'force', useData: true })
        if (res2 && res2.success) {
          useToastStore.getState().showSuccess('已强制上传', file.name)
          await loadCloudTree(cloudPath || '')
        } else {
          useToastStore.getState().showError('上传失败', res2?.message || file.name)
        }
      } else {
        useToastStore.getState().showError('上传失败', res?.message || file.name)
      }
    } catch (e) {
      useToastStore.getState().showError('上传失败', e instanceof Error ? e.message : '未知错误')
    }
  }, [cloudPath, loadCloudTree])

  const chooseAndUploadCloud = useCallback(async () => {
    if (window.electronAPI && typeof window.electronAPI.showOpenDialog === 'function' && typeof window.electronAPI.readBytesFile === 'function') {
      try {
        const picked = await window.electronAPI.showOpenDialog({ properties: ['openFile'] })
        if (!picked || picked.canceled || !picked.filePaths || picked.filePaths.length === 0) return
        const filePath = String(picked.filePaths[0] || '')
        const read = await window.electronAPI.readBytesFile(filePath)
        if (!read || !read.success || !read.data) {
          useToastStore.getState().showError('读取文件失败', filePath)
          return
        }
        const name = filePath.split(sepOf(filePath)).pop() || `file-${Date.now()}`
        const blob = new Blob([read.data], { type: 'application/octet-stream' })
        const target = joinCloudRel(cloudPath || '', name)
        const res = await apiClient.uploadCloudFile(blob, { path: target, mode: 'safe', useData: true })
        if (res && res.success) {
          useToastStore.getState().showSuccess('上传成功', name)
          await loadCloudTree(cloudPath || '')
        } else if (res && !res.success && String(res.message || '').toLowerCase().includes('conflict')) {
          const force = window.confirm('云端已存在同名文件，强制上传会先备份旧文件。\n是否继续？')
          if (!force) return
          const res2 = await apiClient.uploadCloudFile(blob, { path: target, mode: 'force', useData: true })
          if (res2 && res2.success) {
            useToastStore.getState().showSuccess('已强制上传', name)
            await loadCloudTree(cloudPath || '')
          } else {
            useToastStore.getState().showError('上传失败', res2?.message || name)
          }
        } else {
          useToastStore.getState().showError('上传失败', res?.message || name)
        }
      } catch (e) {
        useToastStore.getState().showError('上传失败', e instanceof Error ? e.message : '未知错误')
      }
      return
    }
    uploadInputRef.current?.click()
  }, [cloudPath, loadCloudTree])

  const deleteCloudPathRel = useCallback(async (pathRel: string) => {
    if (!pathRel) return
    const ok = window.confirm(`移动到回收站？\n${pathRel}`)
    if (!ok) return
    try {
      const res = await apiClient.deleteCloudFile({ path: pathRel, trash: true, useData: true })
      if (res && res.success) {
        useToastStore.getState().showSuccess('已移入回收站', pathRel.split('/').pop() || pathRel)
        await loadCloudTree(cloudPath || '')
      } else {
        useToastStore.getState().showError('删除失败', res?.message || '未知错误')
      }
    } catch (e) {
      useToastStore.getState().showError('删除失败', e instanceof Error ? e.message : '未知错误')
    }
  }, [cloudPath, loadCloudTree])

  const restoreTrash = useCallback(async (trashId: string) => {
    try {
      const res = await apiClient.restoreCloudTrash({ trashId, mode: 'safe', useData: true })
      if (res && res.success) {
        useToastStore.getState().showSuccess('已还原', trashId)
        await loadCloudTrash()
        return
      }
      if (res && !res.success && String(res.message || '').toLowerCase().includes('conflict')) {
        const force = window.confirm('目标已存在，强制还原会先备份现有文件。\n是否继续？')
        if (!force) return
        const res2 = await apiClient.restoreCloudTrash({ trashId, mode: 'force', useData: true })
        if (res2 && res2.success) {
          useToastStore.getState().showSuccess('已强制还原', trashId)
          await loadCloudTrash()
        } else {
          useToastStore.getState().showError('还原失败', res2?.message || '未知错误')
        }
        return
      }
      useToastStore.getState().showError('还原失败', res?.message || '未知错误')
    } catch (e) {
      useToastStore.getState().showError('还原失败', e instanceof Error ? e.message : '未知错误')
    }
  }, [loadCloudTrash])

  const deleteTrashItem = useCallback(async (trashId: string) => {
    const ok = window.confirm(`彻底删除？不可恢复。\n${trashId}`)
    if (!ok) return
    try {
      const res = await apiClient.deleteCloudTrashItem({ trashId, useData: true })
      if (res && res.success) {
        useToastStore.getState().showSuccess('已彻底删除', trashId)
        await loadCloudTrash()
      } else {
        useToastStore.getState().showError('删除失败', res?.message || '未知错误')
      }
    } catch (e) {
      useToastStore.getState().showError('删除失败', e instanceof Error ? e.message : '未知错误')
    }
  }, [loadCloudTrash])

  const manualSyncNotes = async () => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) { useToastStore.getState().showError('未开启云同步', '请在设置中开启'); return }
      const root = getDefaultDir()
      const { pushed, failed } = await useNoteFilesStore.getState().syncAllNotes(root)
      if (pushed > 0) {
        useToastStore.getState().showSuccess('笔记同步完成', `成功 ${pushed} 个${failed > 0 ? `，失败 ${failed}` : ''}`)
      } else if (failed > 0) {
        useToastStore.getState().showError('笔记同步失败', `失败 ${failed} 个`)
      } else {
        useToastStore.getState().showSuccess('无变更', '没有需要同步的笔记')
      }
    } catch { void 0 }
  }

  const manualSyncAttachments = async () => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) { useToastStore.getState().showError('未开启云同步', '请在设置中开启'); return }
      const root = getDefaultDir()
      const { uploaded, failed } = await useNoteFilesStore.getState().syncAllAttachments(root)
      if (uploaded > 0) {
        useToastStore.getState().showSuccess('附件同步完成', `成功 ${uploaded} 个${failed > 0 ? `，失败 ${failed}` : ''}`)
      } else if (failed > 0) {
        useToastStore.getState().showError('附件同步失败', `失败 ${failed} 个`)
      } else {
        useToastStore.getState().showSuccess('无变更', '没有需要同步的附件')
      }
    } catch { void 0 }
  }

  const uploadCurrentFile = async () => {
    try {
      if (!currentFile) { useToastStore.getState().showError('上传失败', '未选择文件'); return }
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) { useToastStore.getState().showError('未开启云同步', '请在设置中开启'); return }
      const root = getDefaultDir()
      const ok = await useNoteFilesStore.getState().syncNoteFile(currentFile, root)
      if (ok) {
        const fileName = currentFile.split(sepOf(currentFile)).pop() || ''
        useToastStore.getState().showSuccess('已上传到云端', fileName)
      } else {
        useToastStore.getState().showError('上传失败', '网络或权限错误')
      }
    } catch { void 0 }
  }

  const downloadCurrentFile = async () => {
    try {
      if (!currentFile) { useToastStore.getState().showError('下载失败', '未选择文件'); return }
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      if (!enabled) { useToastStore.getState().showError('未开启云同步', '请在设置中开启'); return }
      const root = getDefaultDir()
      const dir = parentPath(currentFile)
      const noteDir = relativeDir(root, dir)
      const fileName = currentFile.split(sepOf(currentFile)).pop() || 'note.md'
      const res = await apiClient.getNotebookNote({ filename: fileName, noteDir, useData: true })
      if (res && res.success && res.data && res.data.content !== undefined) {
        const ok = await writeFile(currentFile, String(res.data.content))
        if (ok) {
          setContent(String(res.data.content))
          useToastStore.getState().showSuccess('已下载云端内容', fileName)
        } else {
          useToastStore.getState().showError('写入失败', '无法写入本地文件')
        }
      } else {
        useToastStore.getState().showError('下载失败', '云端无此文件')
      }
    } catch (e) {
      useToastStore.getState().showError('下载失败', e instanceof Error ? e.message : '未知错误')
    }
  }

  const chooseDir = async () => {
    try {
      if (!window.electronAPI || typeof window.electronAPI.showOpenDialog !== 'function') {
        useToastStore.getState().showError('选择失败', '请在桌面应用模式下使用目录选择');
        return;
      }
      const res = await window.electronAPI.showOpenDialog({ properties: ['openDirectory'] })
      const paths = res?.filePaths || []
      if (paths.length > 0) {
        const ok = await setDefaultDir(paths[0])
        if (ok) {
          setCurrentDir(paths[0])
          listDir(paths[0])
          const f = getDefaultFile()
          setCurrentFile(f || '')
          if (f) {
            const text = await readFile(f)
            setContent(text || '')
          }
          useToastStore.getState().showSuccess('已设置目录', '记事本默认目录更新')
        } else {
          useToastStore.getState().showError('设置失败', '无法设置记事本目录')
        }
      }
    } catch (e) {
      useToastStore.getState().showError('选择失败', e instanceof Error ? e.message : '未知错误')
    }
  }

  const openFilePicker = async () => {
    try {
      if (!window.electronAPI || typeof window.electronAPI.showOpenDialog !== 'function') {
        useToastStore.getState().showError('选择失败', '请在桌面应用模式下使用文件选择');
        return;
      }
      const res = await window.electronAPI.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md'] }] })
      const paths = res?.filePaths || []
      if (paths.length > 0) {
        const ok = await setDefaultFile(paths[0])
        if (ok) {
          setCurrentFile(paths[0])
          const text = await readFile(paths[0])
          setContent(text || '')
          useToastStore.getState().showSuccess('已设置文件', '默认.md 文件更新')
        } else {
          useToastStore.getState().showError('设置失败', '无法设置默认.md')
        }
      }
    } catch (e) {
      useToastStore.getState().showError('选择失败', e instanceof Error ? e.message : '未知错误')
    }
  }

  const openFile = async (path: string) => {
    try {
      setCurrentFile(path)
      const text = await readFile(path)
      setContent(text || '')
    } catch (e) {
      useToastStore.getState().showError('打开失败', e instanceof Error ? e.message : '未知错误')
    }
  }

  const saveContent = async () => {
    if (!currentFile) {
      useToastStore.getState().showError('保存失败', '未选择文件')
      return
    }
    setSaving(true)
    const ok = await writeFile(currentFile, content)
    setSaving(false)
    if (ok) {
      useToastStore.getState().showSuccess('已保存', '内容已写入文件')
      try {
        const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
        if (enabled && currentFile) {
          const root = getDefaultDir()
          await useNoteFilesStore.getState().syncNoteFile(currentFile, root)
          const fileName = currentFile.split(sepOf(currentFile)).pop() || 'note.md'
          useToastStore.getState().showSuccess('已同步到云端', `${fileName}`)
        }
      } catch (e) {
        useToastStore.getState().showError('云端同步失败', e instanceof Error ? e.message : '未知错误')
      }
    } else {
      useToastStore.getState().showError('保存失败', '写入失败')
    }
  }

  const refresh = () => {
    if (currentDir) listDir(currentDir)
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false) as boolean
      const autoOnRefresh = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ON_REFRESH, true) as boolean
      const autoNotes = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, true) as boolean
      const autoAtt = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, false) as boolean
      if (enabled && autoOnRefresh) {
        const root = getDefaultDir()
        useNoteFilesStore.getState().pullNoteChanges(root).then(({ downloaded, updated, conflicted, failed }) => {
          if (downloaded > 0 || updated > 0 || conflicted > 0) {
            listDir(root)
            const msg = [
              downloaded > 0 ? `下载 ${downloaded}` : '',
              updated > 0 ? `更新 ${updated}` : '',
              conflicted > 0 ? `冲突 ${conflicted}` : '',
              failed > 0 ? `失败 ${failed}` : '',
            ].filter(Boolean).join('，')
            useToastStore.getState().showSuccess('已从云端同步', msg || '无变更')
          } else if (failed > 0) {
            useToastStore.getState().showError('云端同步失败', `失败 ${failed} 个笔记`)
          }
        }).catch(() => { void 0 })
        if (autoNotes) {
          useNoteFilesStore.getState().syncAllNotes(root).then(({ pushed, failed }) => {
            if (pushed > 0) {
              useToastStore.getState().showSuccess('已同步', `成功 ${pushed} 个笔记${failed > 0 ? `，失败 ${failed}` : ''}`)
            } else if (failed > 0) {
              useToastStore.getState().showError('同步失败', `失败 ${failed} 个笔记`)
            }
          }).catch(() => { void 0 })
        }
        if (autoAtt) {
          useNoteFilesStore.getState().syncAllAttachments(root).then(({ uploaded, failed }) => {
            if (uploaded > 0) {
              useToastStore.getState().showSuccess('附件同步完成', `成功 ${uploaded} 个附件${failed > 0 ? `，失败 ${failed}` : ''}`)
            } else if (failed > 0) {
              useToastStore.getState().showError('附件同步失败', `失败 ${failed} 个附件`)
            }
          }).catch(() => { void 0 })
        }
      }
    } catch { void 0 }
  }

  const goParent = () => {
    if (!currentDir) return
    const p = parentPath(currentDir)
    if (!p) return
    setCurrentDir(p)
    listDir(p)
  }

  const toggleExpand = async (dirPath: string) => {
    try {
      const isOpen = !!expanded[dirPath]
      if (isOpen) {
        setExpanded((prev) => ({ ...prev, [dirPath]: false }))
        return
      }
      const entries = await listDirRaw(dirPath)
      setChildrenMap((prev) => ({ ...prev, [dirPath]: { entries } }))
      setExpanded((prev) => ({ ...prev, [dirPath]: true }))
    } catch (e) {
      useToastStore.getState().showError('展开失败', e instanceof Error ? e.message : '未知错误')
    }
  }

  const renderTree = (entries: { name: string; path: string; isDirectory: boolean; isFile: boolean }[], depth: number) => {
    const pad = depth * 12
    return (
      <ul className="space-y-1">
        {entries.filter(e => e.isDirectory).map((e) => (
          <li key={e.path}>
            <div className={`w-full flex items-center space-x-2 px-2 py-1 rounded text-xs ${e.path === currentDir ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`} style={{ paddingLeft: pad }}>
              <button onClick={() => toggleExpand(e.path)} className="flex items-center">
                {expanded[e.path] ? <ChevronDown className={`w-3 h-3 ${e.path === currentDir ? 'text-blue-600' : 'text-gray-500'}`} /> : <ChevronRight className={`w-3 h-3 ${e.path === currentDir ? 'text-blue-600' : 'text-gray-500'}`} />}
              </button>
              <button
                onClick={() => {
                  setCurrentDir(e.path)
                  listDir(e.path)
                }}
                className="flex items-center space-x-2 flex-1 text-left"
              >
                <FolderIcon className={`w-3 h-3 ${e.path === currentDir ? 'text-blue-600' : 'text-yellow-600'}`} />
                <span className="truncate">{e.name}</span>
              </button>
            </div>
            {expanded[e.path] && childrenMap[e.path] && renderTree(childrenMap[e.path].entries, depth + 1)}
          </li>
        ))}
        {entries.filter(e => e.isFile).map((e) => (
          <li key={e.path}>
            <button
              onClick={() => openFile(e.path)}
              className={`w-full flex items-center space-x-2 px-2 py-1 rounded text-xs ${e.path === currentFile ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
              style={{ paddingLeft: pad }}
            >
              <FileText className={`w-3 h-3 ${e.path === currentFile ? 'text-blue-600' : 'text-blue-600'}`} />
              <span className="truncate flex-1 text-left">{e.name}</span>
              {e.path === defaultFilePath && (
                <Star className="w-3 h-3 text-yellow-500" />
              )}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const safeHref = useCallback((href: string) => {
    try {
      if (href.startsWith('#') || href.startsWith('mailto:')) return href
      const u = new URL(href, 'http://localhost')
      const p = u.protocol.toLowerCase()
      if (p === 'http:' || p === 'https:') return href
      return '#'
    } catch {
      return '#'
    }
  }, [])

  const safeSrc = useCallback((src: string) => {
    try {
      if (src.startsWith('attachments/') || src.startsWith('./') || src.startsWith('../')) return src
      const u = new URL(src, 'http://localhost')
      const p = u.protocol.toLowerCase()
      if (p === 'http:' || p === 'https:' || p === 'data:' || p === 'file:') return src
      return ''
    } catch {
      return ''
    }
  }, [])

  const stamp = () => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  }

  const createNote = async () => {
    const baseDir = currentDir || getDefaultDir()
    if (!baseDir) {
      useToastStore.getState().showError('创建失败', '未设置目录')
      return
    }
    let name = (newNoteName || '').trim()
    if (!name) name = `新建笔记-${stamp()}.md`
    if (!name.toLowerCase().endsWith('.md')) name = `${name}.md`
    const path = joinPath(baseDir, name)
    try {
      setCreating(true)
      let finalPath = path
      let idx = 1
      const exists = await readFile(finalPath)
      if (exists !== null) {
        while (idx < 100) {
          const tryPath = joinPath(baseDir, `${name.replace(/\.md$/i, '')}-${idx}.md`)
          const r = await readFile(tryPath)
          if (r === null) { finalPath = tryPath; break }
          idx++
        }
      }
      const title = name.replace(/\.md$/i, '')
      const initial = `# ${title}\n\n`
      const ok = await writeFile(finalPath, initial)
      setCreating(false)
      if (ok) {
        await setDefaultFile(finalPath)
        setCurrentFile(finalPath)
        setContent(initial)
        listDir(baseDir)
        setShowCreate(false)
        setNewNoteName('')
        useToastStore.getState().showSuccess('已创建', '新笔记已创建')
      } else {
        useToastStore.getState().showError('创建失败', '写入失败')
      }
    } catch (e) {
      setCreating(false)
      useToastStore.getState().showError('创建失败', e instanceof Error ? e.message : '未知错误')
    }
  }

  const extractImageBlobs = useCallback((e: { clipboardData?: DataTransfer | null } | null | undefined): Blob[] => {
    try {
      const dt = e?.clipboardData
      if (!dt) return []
      const items = dt.items
      const blobs: Blob[] = []
      if (!items) return blobs
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it && typeof it.type === 'string' && it.type.startsWith('image/')) {
          const f = typeof it.getAsFile === 'function' ? it.getAsFile() : null
          if (f) blobs.push(f)
        }
      }
      return blobs
    } catch {
      return []
    }
  }, [])

  const handlePastedBlobs = useCallback(async (blobs: Blob[], view?: EditorView) => {
    try {
      if (blobs.length === 0) return
      const baseDir = currentFile ? parentPath(currentFile) : (currentDir || getDefaultDir())
      if (!baseDir) return
      let inserted = 0
      const inElectron = !!window.electronAPI
      for (const blob of blobs) {
        const dataUrl = await blobToDataUrl(blob)
        if (inElectron) {
          const base = currentFile ? (currentFile.split(sepOf(currentFile)).pop() || '').replace(/\.md$/i, '') : ''
          const rel = await saveImageToAttachments(baseDir, blob, base)
          if (!rel) {
            useToastStore.getState().showError('保存失败', '附件写入失败')
            continue
          }
          const mdImg = `\n\n![](${rel})\n`
          if (view) {
            const pos = view.state.selection.main.head
            view.dispatch({ changes: { from: pos, to: pos, insert: mdImg } })
            setContent(view.state.doc.toString())
          } else if (currentFile) {
            await appendToFile(currentFile, mdImg)
            setContent((prev) => prev + mdImg)
          } else {
            setContent((prev) => prev + mdImg)
          }
          inserted++

          try {
            const syncEnabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
            if (syncEnabled) {
              const abs = joinPath(baseDir, rel)
              const read =
                window.electronAPI && typeof window.electronAPI.readBytesFile === 'function'
                  ? await window.electronAPI.readBytesFile(abs)
                  : null
              if (read && read.success && read.data) {
                const fileName = rel.split('/').pop() || `image-${Date.now()}.png`
                const noteRoot = getDefaultDir()
                const noteDir = relativeDir(noteRoot, baseDir)
                const pathRel = 'attachments'
                const typeGuess = (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) ? 'image/jpeg'
                  : fileName.toLowerCase().endsWith('.png') ? 'image/png'
                  : fileName.toLowerCase().endsWith('.webp') ? 'image/webp'
                  : 'application/octet-stream'
                const blobU = new Blob([read.data], { type: typeGuess })
                await apiClient.uploadNotebookAttachment(blobU, { filename: fileName, noteDir, pathRel, useData: true })
                useToastStore.getState().showSuccess('已同步到云端', `${fileName}`)
              }
            }
          } catch (e) {
            useToastStore.getState().showError('云端同步失败', e instanceof Error ? e.message : '未知错误')
          }
        } else {
          const mdImg = `\n\n![](${dataUrl})\n`
          if (view) {
            const pos = view.state.selection.main.head
            view.dispatch({ changes: { from: pos, to: pos, insert: mdImg } })
            setContent(view.state.doc.toString())
          } else {
            setContent((prev) => prev + mdImg)
          }
          inserted++
        }
      }
      if (inserted > 0 && inElectron) {
        await listDir(baseDir)
      }
      if (inserted > 0) {
        useToastStore.getState().showSuccess('已粘贴图片', `已插入 ${inserted} 张图片${inElectron ? '（保存到 attachments）' : '（以 data URL 方式）'}`)
      }
    } catch (err) {
      useToastStore.getState().showError('粘贴失败', err instanceof Error ? err.message : '未知错误')
    }
  }, [
    appendToFile,
    currentDir,
    currentFile,
    getDefaultDir,
    listDir,
    saveImageToAttachments,
  ])

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const blobs = extractImageBlobs(e)
    if (blobs.length === 0) return
    e.preventDefault()
    await handlePastedBlobs(blobs)
  }, [extractImageBlobs, handlePastedBlobs])

  const handlePastedBlobsRef = useRef(handlePastedBlobs)
  useEffect(() => {
    handlePastedBlobsRef.current = handlePastedBlobs
  }, [handlePastedBlobs])

  const createMd = useCallback(() => {
    const md = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true,
      typographer: true,
    })
    md.use(taskLists, { enabled: true })
    md.use(footnote)
    const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const i = tokens[idx].attrIndex('href')
      if (i >= 0) {
        const href = tokens[idx].attrs![i][1]
        tokens[idx].attrs![i][1] = safeHref(href)
      }
      tokens[idx].attrPush(['target', '_blank'])
      tokens[idx].attrPush(['rel', 'noopener noreferrer'])
      return defaultLinkOpen(tokens, idx, options, env, self)
    }
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const i = tokens[idx].attrIndex('src')
      if (i >= 0) {
        const src = tokens[idx].attrs![i][1]
        const sanitized = safeSrc(src)
        tokens[idx].attrs![i][1] = sanitized
        if (src.startsWith('attachments/') || src.startsWith('./') || src.startsWith('../')) {
          tokens[idx].attrPush(['data-xpaste-local', 'true'])
          tokens[idx].attrPush(['data-xpaste-src', src])
        }
      }
      return self.renderToken(tokens, idx, options)
    }
    return md
  }, [safeHref, safeSrc])

  const debugLog = useCallback((...args: unknown[]) => {
    try {
      const s = args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a) } catch { return String(a) }
      }).join(' ')
      console.log('[NotebookPreview]', ...args)
      if (window.electronAPI && typeof window.electronAPI.log === 'function') {
        window.electronAPI.log('[NotebookPreview] ' + s)
      }
    } catch { void 0 }
  }, [])

  useEffect(() => {
    mdRef.current = createMd()
  }, [createMd])

  useEffect(() => {
    const inElectron = !!window.electronAPI
    if (!inElectron) return
    if (!preview || !previewRef.current) return
    const baseDir = currentFile
      ? currentFile.replace(/[\\/][^\\/]*$/, '')
      : (currentDir || useNoteFilesStore.getState().getDefaultDir())
    if (!baseDir) return
    const imgs = Array.from(previewRef.current.querySelectorAll('img[data-xpaste-local="true"]')) as HTMLImageElement[]
    debugLog('preview-load-start', { count: imgs.length, baseDir })
    const guessType = (p: string) => {
      const lower = p.toLowerCase()
      if (lower.endsWith('.png')) return 'image/png'
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
      if (lower.endsWith('.webp')) return 'image/webp'
      if (lower.endsWith('.gif')) return 'image/gif'
      return 'image/png'
    }
    const toUint8 = (d: unknown): Uint8Array | null => {
      try {
        if (!d) return null
        if (d instanceof Uint8Array) return d
        if (Array.isArray(d) && d.every((n) => typeof n === 'number')) return new Uint8Array(d)
        if (typeof d === 'object') {
          const obj = d as Record<string, unknown>
          if (obj.type === 'Buffer' && Array.isArray(obj.data) && obj.data.every((n) => typeof n === 'number')) {
            return new Uint8Array(obj.data)
          }
          if (typeof obj.byteLength === 'number' && obj.buffer instanceof ArrayBuffer) {
            return new Uint8Array(obj.buffer)
          }
        }
      } catch { void 0 }
      return null
    }

    const loadAll = async () => {
      for (const img of imgs) {
        const rel = img.getAttribute('data-xpaste-src') || ''
        if (!rel) continue
        let decoded = rel
        try { decoded = decodeURIComponent(rel) } catch { void 0 }
        const sep = baseDir.includes('\\') ? '\\' : '/'
        const abs = baseDir.replace(/[\\/]$/, '') + sep + decoded
        let exists = true
        if (typeof window.electronAPI.existsPath === 'function') {
          try {
            const ex = await window.electronAPI.existsPath(abs)
            exists = !!(ex && ex.success && ex.data)
          } catch { exists = true }
        }
        if (!exists) { img.alt = '图片不存在'; debugLog('image-not-exists', { rel, abs }); continue }

        let ok = false

        // 优先使用本地 file:// 路径加载，失败则回退到字节或 dataURL
        try {
          const fileUrl = 'file://' + abs.replace(/\\/g, '/');
          img.decoding = 'async'
          img.loading = 'lazy'
          img.src = encodeURI(fileUrl)
          await new Promise((resolve, reject) => {
            const onLoad = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); resolve(null) }
            const onErr = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); reject(new Error('file-url-error')) }
            img.addEventListener('load', onLoad)
            img.addEventListener('error', onErr)
          })
          ok = true
          debugLog('image-loaded-file-url', { rel, abs })
        } catch { void 0 }

        if (!ok && typeof window.electronAPI.readBytesFile === 'function') {
          try {
            const res = await window.electronAPI.readBytesFile(abs)
            const u8 = res && res.success ? toUint8(res.data) : null
            if (u8 && u8.byteLength > 0) {
              const blob = new Blob([u8], { type: guessType(rel) })
              const url = URL.createObjectURL(blob)
              img.src = url
              ok = true
              debugLog('image-loaded-blob', { rel, abs, size: u8.byteLength })
            }
          } catch { void 0 }
        }

        if (!ok && typeof window.electronAPI.readDataUrlFile === 'function') {
          try {
            const res2 = await window.electronAPI.readDataUrlFile(abs)
            if (res2 && res2.success && res2.data) {
              img.src = res2.data
              ok = true
              debugLog('image-loaded-dataurl', { rel, abs, len: (res2.data || '').length })
            }
          } catch { void 0 }
        }

        if (!ok) { img.alt = '图片加载失败'; debugLog('image-load-failed', { rel, abs }) }
      }
    }
    loadAll()
  }, [preview, content, currentDir, currentFile, debugLog])

  useEffect(() => {
    if (!preview) return
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [preview, handlePaste])

  const mdStyle = useMemo(() => {
    return HighlightStyle.define([
      { tag: tags.heading, fontSize: '1rem', fontWeight: '700' },
      { tag: tags.heading1, fontSize: '1.5rem', fontWeight: '700' },
      { tag: tags.heading2, fontSize: '1.25rem', fontWeight: '700' },
      { tag: tags.heading3, fontSize: '1.1rem', fontWeight: '700' },
      { tag: tags.strong, fontWeight: '700' },
      { tag: tags.emphasis, fontStyle: 'italic' },
      theme === 'dark'
        ? { tag: tags.monospace, background: '#1f2937', color: '#e5e7eb', padding: '0 0.25rem', borderRadius: '4px' }
        : { tag: tags.monospace, background: '#f3f4f6', color: '#111827', padding: '0 0.25rem', borderRadius: '4px' },
    ])
  }, [theme])

  useEffect(() => {
    if (!preview && editorHostRef.current) {
      const extensions = [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        highlightSelectionMatches(),
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const blobs = extractImageBlobs(event)
            if (blobs.length === 0) return false
            event.preventDefault()
            handlePastedBlobsRef.current(blobs, view)
            return true
          },
        }),
        syntaxHighlighting(mdStyle, { fallback: true }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            const text = v.state.doc.toString()
            setContent(text)
          }
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
        }),
      ]
      const themed = theme === 'dark' ? [oneDark, ...extensions] : extensions
      const view = new EditorView({
        state: EditorState.create({
          doc: contentRef.current,
          extensions: themed,
        }),
        parent: editorHostRef.current,
      })
      editorViewRef.current = view
      return () => {
        view.destroy()
        editorViewRef.current = null
      }
    }
  }, [preview, theme, mdStyle, extractImageBlobs])

  useEffect(() => {
    if (!preview && editorViewRef.current) {
      const cur = editorViewRef.current
      const currentDoc = cur.state.doc.toString()
      if (currentDoc !== content) {
        cur.dispatch({ changes: { from: 0, to: cur.state.doc.length, insert: content } })
      }
    }
  }, [content, preview])

  const applyEditorSearch = (dir: 'next' | 'prev') => {
    if (!editorViewRef.current || !searchQuery) return
    const view = editorViewRef.current
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: searchQuery, caseSensitive: false })) })
    if (dir === 'next') findNext(view)
    else findPrevious(view)
  }

  const clearPreviewSearch = useCallback(() => {
    if (!previewRef.current) return
    const container = previewRef.current
    const marks = container.querySelectorAll('mark.preview-match')
    marks.forEach((m) => {
      const parent = m.parentNode
      if (!parent) return
      const text = document.createTextNode(m.textContent || '')
      parent.replaceChild(text, m)
      parent.normalize()
    })
    setPreviewMatchIndex(0)
    setPreviewMatchCount(0)
  }, [])

  const applyPreviewSearch = useCallback(() => {
    if (!previewRef.current) return
    clearPreviewSearch()
    if (!searchQuery) return
    const container = previewRef.current
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const q = searchQuery.toLowerCase()
    const nodes: Text[] = []
    let node: Node | null = walker.nextNode()
    while (node) {
      const t = node as Text
      if (t.nodeValue && t.nodeValue.toLowerCase().includes(q)) nodes.push(t)
      node = walker.nextNode()
    }
    let count = 0
    nodes.forEach((t) => {
      const v = t.nodeValue || ''
      let idx = 0
      const frag = document.createDocumentFragment()
      while (true) {
        const i = v.toLowerCase().indexOf(q, idx)
        if (i === -1) break
        const before = v.slice(idx, i)
        const match = v.slice(i, i + q.length)
        if (before) frag.appendChild(document.createTextNode(before))
        const mark = document.createElement('mark')
        mark.className = 'preview-match'
        mark.textContent = match
        frag.appendChild(mark)
        idx = i + q.length
        count++
      }
      const rest = v.slice(idx)
      if (rest) frag.appendChild(document.createTextNode(rest))
      if (t.parentNode) t.parentNode.replaceChild(frag, t)
    })
    setPreviewMatchCount(count)
    setPreviewMatchIndex(count > 0 ? 0 : 0)
    if (count > 0) {
      const first = container.querySelectorAll('mark.preview-match')[0] as HTMLElement
      if (first) {
        first.classList.add('preview-match-active')
        first.scrollIntoView({ block: 'center' })
      }
    }
  }, [clearPreviewSearch, searchQuery])

  const gotoPreviewMatch = (dir: 'next' | 'prev') => {
    if (!previewRef.current || previewMatchCount === 0) return
    const matches = Array.from(previewRef.current.querySelectorAll('mark.preview-match')) as HTMLElement[]
    const cur = previewMatchIndex
    const next = dir === 'next' ? (cur + 1) % matches.length : (cur - 1 + matches.length) % matches.length
    matches[cur]?.classList.remove('preview-match-active')
    matches[next]?.classList.add('preview-match-active')
    matches[next]?.scrollIntoView({ block: 'center' })
    setPreviewMatchIndex(next)
  }

  useEffect(() => {
    if (preview && previewRef.current) {
      const nodes = previewRef.current.querySelectorAll('pre code')
      nodes.forEach((el) => {
        const elem = el as HTMLElement
        const already = elem.getAttribute('data-highlighted') === 'yes' || elem.classList.contains('hljs')
        if (!already) {
          hljs.highlightElement(elem)
          elem.classList.add('hljs')
        }
      })

      const pres = previewRef.current.querySelectorAll('pre')
      pres.forEach((pre) => {
        if (pre.parentElement && pre.parentElement.classList.contains('code-block')) return
        const code = pre.querySelector('code')
        if (!code) return
        const text = code.textContent || ''
        const container = document.createElement('div')
        container.className = 'code-block relative'
        const copyBtn = document.createElement('button')
        copyBtn.textContent = '复制'
        copyBtn.className = 'absolute top-2 right-2 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200'
        copyBtn.addEventListener('click', async (e) => {
          e.preventDefault()
          e.stopPropagation()
          try {
            await navigator.clipboard.writeText(text)
            useToastStore.getState().showSuccess('已复制', '代码已复制到剪贴板')
          } catch (err) {
            useToastStore.getState().showError('复制失败', err instanceof Error ? err.message : '未知错误')
          }
        })
        const parent = pre.parentElement
        if (!parent) return
        parent.insertBefore(container, pre)
        container.appendChild(pre)
        container.appendChild(copyBtn)
        pre.classList.add('overflow-x-auto')
        pre.classList.add('overflow-y-hidden')
      })
    }
  }, [preview, content])

  useEffect(() => {
    if (preview && searchQuery) applyPreviewSearch()
  }, [preview, content, applyPreviewSearch, searchQuery])

  const defaultFilePath = getDefaultFile()

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white p-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-gray-700" />
          <span className="text-sm font-medium text-gray-900">记事本</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <button onClick={chooseDir} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center space-x-1" title="选择目录">
            <FolderOpen className="w-3 h-3" />
            <span className="hidden sm:inline">选择目录</span>
          </button>
          <button onClick={openFilePicker} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200" title="选择默认.md">
            <span className="hidden sm:inline">选择默认.md</span>
          </button>
          <button onClick={refresh} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center space-x-1" title="刷新">
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">刷新</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowSyncMenu(s => !s)} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 flex items-center space-x-1" title="同步">
              <Cloud className="w-3 h-3" />
              <span className="hidden sm:inline">同步 ▾</span>
            </button>
            {showSyncMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded shadow p-2 z-10 min-w-[180px]">
                <div className="flex flex-col space-y-1">
                  <button
                    onClick={() => { setShowManualSync(true); setShowSyncMenu(false) }}
                    className="px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-left"
                  >手动同步</button>
                  <button onClick={manualSyncNotes} className="px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-left">同步笔记</button>
                  <button onClick={manualSyncAttachments} className="px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-left">同步附件</button>
                  <button onClick={uploadCurrentFile} className="px-2 py-1 rounded text-xs bg-green-50 text-green-700 hover:bg-green-100 text-left">上传当前</button>
                  <button onClick={downloadCurrentFile} className="px-2 py-1 rounded text-xs bg-yellow-50 text-yellow-700 hover:bg-yellow-100 text-left">下载当前</button>
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    onClick={async () => {
                      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, !syncEnabledSetting)
                    }}
                    className={`px-2 py-1 rounded text-xs text-left ${syncEnabledSetting ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >云同步</button>
                  <button
                    onClick={async () => {
                      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ON_REFRESH, !autoOnRefreshSetting)
                    }}
                    className={`px-2 py-1 rounded text-xs text-left ${autoOnRefreshSetting ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >刷新自动</button>
                  <button
                    onClick={async () => {
                      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, !autoNotesSetting)
                    }}
                    className={`px-2 py-1 rounded text-xs text-left ${autoNotesSetting ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >自动笔记</button>
                  <button
                    onClick={async () => {
                      await useSettingsStore.getState().setSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, !autoAttSetting)
                    }}
                    className={`px-2 py-1 rounded text-xs text-left ${autoAttSetting ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >自动附件</button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => { setCloudTab('files'); setShowCloudManager(true) }}
            className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center space-x-1"
            title="云端文件管理"
          >
            <Cloud className="w-3 h-3" />
            <span className="hidden sm:inline">云端文件</span>
          </button>
          <button onClick={saveContent} disabled={saving} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-green-100 text-green-700 hover:bg-green-200 flex items-center space-x-1" title={saving ? '保存中' : '保存'}>
            <Save className="w-3 h-3" />
            <span className="hidden sm:inline">{saving ? '保存中' : '保存'}</span>
          </button>
          <button onClick={() => setPreview(v => !v)} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center space-x-1" title={preview ? '编辑' : '预览'}>
            {preview ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span className="hidden sm:inline">{preview ? '编辑' : '预览'}</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowCreate(s => !s)} className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center space-x-1" title="新建">
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">新建</span>
            </button>
            {showCreate && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded shadow p-2 flex items-center space-x-2 z-10">
                <input
                  value={newNoteName}
                  onChange={(e) => setNewNoteName(e.target.value)}
                  placeholder="文件名.md"
                  className="border border-gray-300 rounded px-2 py-1 text-xs w-40"
                />
                <button
                  onClick={createNote}
                  disabled={creating}
                  className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 hover:bg-green-200"
                >
                  {creating ? '创建中' : '创建'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewNoteName('') }}
                  className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  取消
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center">
            <button
              onClick={() => setTheme('light')}
              className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-l text-xs flex items-center space-x-1 ${theme === 'light' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
              <Sun className="w-3 h-3" />
              <span className="hidden sm:inline">浅色</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-r text-xs flex items-center space-x-1 ${theme === 'dark' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
              <Moon className="w-3 h-3" />
              <span className="hidden sm:inline">深色</span>
            </button>
          </div>
          <div className="flex items-center space-x-1">
            <div className="flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 border rounded text-xs bg-white">
              <Search className="w-3 h-3 mr-1 text-gray-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!preview) applyEditorSearch('next')
                    else applyPreviewSearch()
                  }
                }}
                placeholder="查找"
                className="outline-none bg-transparent text-gray-700 w-20 sm:w-28"
              />
            </div>
            <button
              onClick={() => (!preview ? applyEditorSearch('prev') : gotoPreviewMatch('prev'))}
              className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => (!preview ? applyEditorSearch('next') : gotoPreviewMatch('next'))}
              className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                if (!preview) setSearch('')
                else {
                  clearPreviewSearch()
                  setSearch('')
                }
              }}
              className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center"
            >
              <X className="w-3 h-3" />
            </button>
            {preview && (
              <span className="text-xs text-gray-500">{previewMatchCount > 0 ? `${previewMatchIndex + 1}/${previewMatchCount}` : '0'}</span>
            )}
          </div>
        </div>
      </div>
      {showManualSync && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !syncRunning) setShowManualSync(false)
          }}
        >
          <div className="w-[92vw] max-w-3xl h-[70vh] bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cloud className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-medium text-gray-900">手动同步</span>
              </div>
              <button
                onClick={() => { if (!syncRunning) setShowManualSync(false) }}
                className={`p-1 rounded ${syncRunning ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'}`}
                title="关闭"
                disabled={syncRunning}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <div className="text-xs text-gray-600 truncate max-w-[60%]" title={getDefaultDir() || ''}>
                本地目录：{getDefaultDir() || '未设置'}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={manualSyncDownloadAllCloud}
                  disabled={syncRunning}
                  className={`px-2 py-1 rounded text-xs ${syncRunning ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}
                >从云端下载全部</button>
                <button
                  onClick={manualSyncUploadAllLocal}
                  disabled={syncRunning}
                  className={`px-2 py-1 rounded text-xs ${syncRunning ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                >上传本地全部</button>
                <button
                  onClick={() => { syncAbortRef.current = true }}
                  disabled={!syncRunning}
                  className={`px-2 py-1 rounded text-xs ${syncRunning ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                >停止</button>
              </div>
            </div>
            <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-600 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span>总数 {syncStats.total}</span>
                <span>完成 {syncStats.done}</span>
                <span>跳过 {syncStats.skipped}</span>
                <span>冲突 {syncStats.conflicted}</span>
                <span>失败 {syncStats.failed}</span>
              </div>
              <div className="text-[10px] text-gray-400">{syncRunning ? '进行中…' : '空闲'}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {syncLogs.length === 0 ? (
                <div className="text-xs text-gray-500">点击上方按钮开始同步</div>
              ) : (
                <pre className="text-xs whitespace-pre-wrap break-words text-gray-800">{syncLogs.join('\n')}</pre>
              )}
            </div>
            {syncConflict && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-[92%] max-w-lg bg-white rounded border border-gray-200 shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900">发现冲突</div>
                    <div className="text-xs text-gray-500">{syncConflict.direction === 'upload' ? '上传覆盖云端' : '下载覆盖本地'}</div>
                  </div>
                  <div className="px-3 py-2 text-xs text-gray-700">
                    <div className="break-all">{syncConflict.path}</div>
                  </div>
                  <div className="px-3 pb-2 text-xs text-gray-600 grid grid-cols-2 gap-3">
                    <div className="border rounded p-2">
                      <div className="text-[10px] text-gray-400 mb-1">本地</div>
                      <div>大小：{fmtBytes(syncConflict.local?.sizeBytes)}</div>
                      <div className="truncate" title={syncConflict.local?.sha256 || ''}>SHA256：{syncConflict.local?.sha256 ? String(syncConflict.local.sha256).slice(0, 12) + '…' : '-'}</div>
                    </div>
                    <div className="border rounded p-2">
                      <div className="text-[10px] text-gray-400 mb-1">云端</div>
                      <div>大小：{fmtBytes(syncConflict.remote?.sizeBytes)}</div>
                      <div>时间：{fmtTime(syncConflict.remote?.mtimeMs)}</div>
                      <div className="truncate" title={syncConflict.remote?.sha256 || ''}>SHA256：{syncConflict.remote?.sha256 ? String(syncConflict.remote.sha256).slice(0, 12) + '…' : '-'}</div>
                    </div>
                  </div>
                  <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => { syncConflictResolveRef.current?.('skip') }}
                      className="px-3 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >跳过</button>
                    <button
                      onClick={() => { syncConflictResolveRef.current?.('force') }}
                      className="px-3 py-1 rounded text-xs bg-red-50 text-red-700 hover:bg-red-100"
                    >强制替换</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showCloudManager && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCloudManager(false)
          }}
        >
          <div className="w-[92vw] max-w-5xl h-[78vh] bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cloud className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-medium text-gray-900">云端文件管理</span>
              </div>
              <button
                onClick={() => setShowCloudManager(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCloudTab('files')}
                  className={`px-2 py-1 rounded text-xs ${cloudTab === 'files' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >文件</button>
                <button
                  onClick={() => setCloudTab('trash')}
                  className={`px-2 py-1 rounded text-xs ${cloudTab === 'trash' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >回收站</button>
              </div>
              <div className="flex items-center space-x-2">
                {cloudTab === 'files' && (
                  <>
                    <div className="text-xs text-gray-600 max-w-[36vw] truncate" title={cloudPath || '/'}>{cloudPath || '/'}</div>
                    <button
                      onClick={() => loadCloudTree(cloudPath || '')}
                      className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >刷新</button>
                    <button
                      onClick={() => { const next = parentCloudRel(cloudPath); loadCloudTree(next); }}
                      disabled={!cloudPath}
                      className={`px-2 py-1 rounded text-xs ${cloudPath ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                    >上一级</button>
                    <button
                      onClick={chooseAndUploadCloud}
                      className="px-2 py-1 rounded text-xs bg-green-50 text-green-700 hover:bg-green-100 flex items-center space-x-1"
                    >
                      <Upload className="w-3 h-3" />
                      <span>上传</span>
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0]
                        if (f) uploadCloudFromFile(f)
                        e.currentTarget.value = ''
                      }}
                    />
                  </>
                )}
                {cloudTab === 'trash' && (
                  <button
                    onClick={loadCloudTrash}
                    className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >刷新</button>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 flex">
              <div className="w-[52%] border-r border-gray-100 min-h-0 flex flex-col">
                {cloudLoading && (
                  <div className="p-3 text-xs text-gray-500">加载中...</div>
                )}
                {!cloudLoading && cloudTab === 'files' && (
                  <div className="flex-1 min-h-0 overflow-auto">
                    {cloudItems.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500">空目录</div>
                    ) : (
                      <ul className="p-1">
                        {cloudItems.map((it) => (
                          <li key={it.path} className={`px-2 py-1 rounded text-xs flex items-center space-x-2 ${cloudSelectedPath === it.path ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                            <button
                              onClick={() => {
                                if (it.is_dir) {
                                  setCloudSelectedPath('')
                                  setCloudPreview(null)
                                  loadCloudTree(it.path)
                                } else {
                                  setCloudSelectedPath(it.path)
                                }
                              }}
                              className="flex items-center space-x-2 flex-1 min-w-0 text-left"
                              title={it.path}
                            >
                              {it.is_dir ? (
                                <FolderIcon className="w-3 h-3 text-blue-600" />
                              ) : (
                                <FileText className="w-3 h-3 text-gray-600" />
                              )}
                              <span className="truncate">{it.name}</span>
                              {!it.is_dir && (
                                <span className="text-[10px] text-gray-400">{fmtBytes(it.size_bytes)}</span>
                              )}
                              <span className="text-[10px] text-gray-400">{fmtTime(it.mtime_ms)}</span>
                            </button>
                            {!it.is_dir && (
                              <button
                                onClick={() => previewCloudFile(it.path)}
                                className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >预览</button>
                            )}
                            <button
                              onClick={() => deleteCloudPathRel(it.path)}
                              className="p-1 rounded hover:bg-red-50 text-red-600"
                              title="删除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {!cloudLoading && cloudTab === 'trash' && (
                  <div className="flex-1 min-h-0 overflow-auto">
                    {cloudTrash.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500">回收站为空</div>
                    ) : (
                      <ul className="p-1">
                        {cloudTrash.map((it) => (
                          <li key={it.trash_id} className="px-2 py-1 rounded text-xs flex items-center space-x-2 hover:bg-gray-50">
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-gray-800" title={it.original_path}>{it.original_path}</div>
                              <div className="text-[10px] text-gray-400 flex items-center space-x-2">
                                <span>{fmtTime(it.deleted_at_ms)}</span>
                                {!it.is_dir && <span>{fmtBytes(it.size_bytes)}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => restoreTrash(it.trash_id)}
                              className="px-2 py-0.5 rounded text-[10px] bg-green-50 text-green-700 hover:bg-green-100"
                            >还原</button>
                            <button
                              onClick={() => deleteTrashItem(it.trash_id)}
                              className="px-2 py-0.5 rounded text-[10px] bg-red-50 text-red-700 hover:bg-red-100"
                            >彻底删除</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-600 truncate" title={cloudPreview?.path || ''}>
                  {cloudPreview ? cloudPreview.path : '预览'}
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-3">
                  {!cloudPreview && (
                    <div className="text-xs text-gray-500">选择文件后点击“预览”</div>
                  )}
                  {cloudPreview && cloudPreview.kind === 'image' && cloudPreview.url && (
                    <div className="w-full h-full flex items-center justify-center">
                      <img src={cloudPreview.url} alt={cloudPreview.path} className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                  {cloudPreview && cloudPreview.kind === 'text' && (
                    <pre className="text-xs whitespace-pre-wrap break-words text-gray-800">{cloudPreview.text || ''}</pre>
                  )}
                  {cloudPreview && cloudPreview.kind === 'binary' && (
                    <div className="text-xs text-gray-500">二进制文件，大小 {fmtBytes(cloudPreview.sizeBytes)}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <div className="border-r border-gray-200 bg-white flex flex-col" style={{ width: `${sidebarWidth}px` }}>
          <div className="p-2 border-b border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-600 truncate max-w-[10rem]" title={currentDir}>{currentDir || '未设置目录'}</div>
            <button onClick={goParent} className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center space-x-1">
              <ArrowLeft className="w-3 h-3" />
              <span>上一级</span>
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading && (
              <div className="p-3 text-xs text-gray-500">加载中...</div>
            )}
            {!isLoading && tree.length === 0 && (
              <div className="p-3 text-xs text-gray-500">空目录</div>
            )}
            {!isLoading && tree.length > 0 && (
              <div className="p-1">
                {renderTree(tree, 0)}
              </div>
            )}
          </div>
        </div>
        <div
          onMouseDown={(e) => {
            resizingRef.current = true
            startXRef.current = e.clientX
            startWRef.current = sidebarWidth
            document.body.style.cursor = 'col-resize'
            const onMove = (ev: MouseEvent) => {
              if (!resizingRef.current) return
              const dx = ev.clientX - startXRef.current
              let w = startWRef.current + dx
              if (w < 180) w = 180
              if (w > 560) w = 560
              setSidebarWidth(w)
            }
            const onUp = () => {
              resizingRef.current = false
              document.body.style.cursor = ''
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
          className={`${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} w-1 cursor-col-resize select-none`}
        />
        <div className="flex-1 p-3 flex flex-col min-h-0 overflow-hidden">
          <div className="text-xs text-gray-500 mb-2">文件：{currentFile || '未选择'}</div>
          {!preview ? (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <div
                ref={editorHostRef}
                className={`w-full h-full min-h-0 border rounded ${theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-white'}`}
              />
            </div>
          ) : (
            <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${theme === 'dark' ? 'bg-gray-900' : ''}`}>
              <div
                className={`w-full h-full min-h-0 border rounded p-3 prose prose-sm max-w-none ${theme === 'dark' ? 'border-gray-700 bg-gray-900 text-gray-100 prose-invert' : 'border-gray-200 bg-white text-gray-900'} select-text`}
                dangerouslySetInnerHTML={{ __html: (mdRef.current?.render(content || '')) || '' }}
                ref={previewRef}
                onPaste={(e) => {
                  const blobs = extractImageBlobs(e)
                  if (blobs.length === 0) return
                  e.preventDefault()
                  handlePastedBlobs(blobs)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
