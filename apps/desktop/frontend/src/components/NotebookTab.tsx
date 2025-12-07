import { useEffect, useState, useRef, useMemo } from 'react'
import { useNoteFilesStore } from '@/store/noteFiles'
import { useSettingsStore, SETTING_KEYS } from '@/store/settings'
import apiClient from '@/lib/api'
import { useToastStore } from '@/store/toast'
import { FileText, FolderOpen, Save, RefreshCw, ArrowLeft, Folder as FolderIcon, Eye, Pencil, Sun, Moon, Search, ChevronUp, ChevronDown, ChevronRight, X, Plus, Star } from 'lucide-react'
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

  const syncEnabledSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false))
  const autoOnRefreshSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ON_REFRESH, true))
  const autoNotesSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, true))
  const autoAttSetting = useSettingsStore(s => s.getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, false))
  const resizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWRef = useRef(288)
  const previewRef = useRef<HTMLDivElement>(null)
  const mdRef = useRef<MarkdownIt | null>(null)
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)

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
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      const autoNotes = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, true)
      const autoAtt = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, false)
      const root = getDefaultDir()
      if (enabled && root) {
        if (autoNotes) useNoteFilesStore.getState().syncAllNotes(root).catch(() => {})
        if (autoAtt) useNoteFilesStore.getState().syncAllAttachments(root).catch(() => {})
      }
    } catch {}
  }, [])

  const manualSyncNotes = async () => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
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
    } catch {}
  }

  const manualSyncAttachments = async () => {
    try {
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
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
    } catch {}
  }

  const uploadCurrentFile = async () => {
    try {
      if (!currentFile) { useToastStore.getState().showError('上传失败', '未选择文件'); return }
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      if (!enabled) { useToastStore.getState().showError('未开启云同步', '请在设置中开启'); return }
      const root = getDefaultDir()
      const ok = await useNoteFilesStore.getState().syncNoteFile(currentFile, root)
      if (ok) {
        const fileName = currentFile.split(sepOf(currentFile)).pop() || ''
        useToastStore.getState().showSuccess('已上传到云端', fileName)
      } else {
        useToastStore.getState().showError('上传失败', '网络或权限错误')
      }
    } catch {}
  }

  const downloadCurrentFile = async () => {
    try {
      if (!currentFile) { useToastStore.getState().showError('下载失败', '未选择文件'); return }
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
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
        const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
        if (enabled && currentFile) {
          const root = getDefaultDir()
          const dir = parentPath(currentFile)
          const noteDir = relativeDir(root, dir)
          const fileName = currentFile.split(sepOf(currentFile)).pop() || 'note.md'
          await apiClient.pushNotebookNote(content, { filename: fileName, noteDir, useData: true })
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
      const enabled = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_SYNC_ENABLED, false)
      const autoOnRefresh = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ON_REFRESH, true)
      const autoNotes = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_NOTES, true)
      const autoAtt = useSettingsStore.getState().getSetting(SETTING_KEYS.NOTEBOOK_AUTO_SYNC_ATTACHMENTS, false)
      if (enabled && autoOnRefresh) {
        const root = getDefaultDir()
        if (autoNotes) {
          useNoteFilesStore.getState().syncAllNotes(root).then(({ pushed, failed }) => {
            if (pushed > 0) {
              useToastStore.getState().showSuccess('已同步', `成功 ${pushed} 个笔记${failed > 0 ? `，失败 ${failed}` : ''}`)
            } else if (failed > 0) {
              useToastStore.getState().showError('同步失败', `失败 ${failed} 个笔记`)
            }
          }).catch(() => {})
        }
        if (autoAtt) {
          useNoteFilesStore.getState().syncAllAttachments(root).then(({ uploaded, failed }) => {
            if (uploaded > 0) {
              useToastStore.getState().showSuccess('附件同步完成', `成功 ${uploaded} 个附件${failed > 0 ? `，失败 ${failed}` : ''}`)
            } else if (failed > 0) {
              useToastStore.getState().showError('附件同步失败', `失败 ${failed} 个附件`)
            }
          }).catch(() => {})
        }
      }
    } catch {}
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

  const safeHref = (href: string) => {
    try {
      if (href.startsWith('#') || href.startsWith('mailto:')) return href
      const u = new URL(href, 'http://localhost')
      const p = u.protocol.toLowerCase()
      if (p === 'http:' || p === 'https:') return href
      return '#'
    } catch {
      return '#'
    }
  }

  const safeSrc = (src: string) => {
    try {
      if (src.startsWith('attachments/') || src.startsWith('./') || src.startsWith('../')) return src
      const u = new URL(src, 'http://localhost')
      const p = u.protocol.toLowerCase()
      if (p === 'http:' || p === 'https:' || p === 'data:' || p === 'file:') return src
      return ''
    } catch {
      return ''
    }
  }

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

  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('read-error'))
      reader.readAsDataURL(blob)
    })
  }

  const extractImageBlobs = (e: any): Blob[] => {
    try {
      const dt: any = (e && (e as any).clipboardData) || (e && e.clipboardData)
      if (!dt) return []
      const items = dt.items || []
      const blobs: Blob[] = []
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
  }

  const handlePastedBlobs = async (blobs: Blob[], view?: EditorView) => {
    try {
      if (blobs.length === 0) return
      const baseDir = currentFile ? parentPath(currentFile) : (currentDir || getDefaultDir())
      if (!baseDir) return
      let inserted = 0
      const inElectron = !!(window as any).electronAPI
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
              const read = await window.electronAPI.readBytesFile(abs)
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
  }

  const handlePaste = async (e: any) => {
    const blobs = extractImageBlobs(e)
    if (blobs.length === 0) return
    e.preventDefault()
    await handlePastedBlobs(blobs)
  }

  const createMd = () => {
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
  }

  useEffect(() => {
    mdRef.current = createMd()
  }, [currentDir, currentFile])

  useEffect(() => {
    const inElectron = !!(window as any).electronAPI
    if (!inElectron) return
    if (!preview || !previewRef.current) return
    const baseDir = currentFile ? parentPath(currentFile) : (currentDir || getDefaultDir())
    if (!baseDir) return
    const imgs = Array.from(previewRef.current.querySelectorAll('img[data-xpaste-local="true"]')) as HTMLImageElement[]
    const guessType = (p: string) => {
      const lower = p.toLowerCase()
      if (lower.endsWith('.png')) return 'image/png'
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
      if (lower.endsWith('.webp')) return 'image/webp'
      if (lower.endsWith('.gif')) return 'image/gif'
      return 'image/png'
    }
    const loadAll = async () => {
      for (const img of imgs) {
        const rel = img.getAttribute('data-xpaste-src') || ''
        if (!rel) continue
        const abs = joinPath(baseDir, rel)
        try {
          let ok = false
          if (typeof window.electronAPI.readBytesFile === 'function') {
            const res = await window.electronAPI.readBytesFile(abs)
            if (res && res.success && res.data) {
              const blob = new Blob([res.data], { type: guessType(rel) })
              const url = URL.createObjectURL(blob)
              img.src = url
              ok = true
            }
          }
          if (!ok && typeof window.electronAPI.readDataUrlFile === 'function') {
            const res2 = await window.electronAPI.readDataUrlFile(abs)
            if (res2 && res2.success && res2.data) {
              img.src = res2.data
              ok = true
            }
          }
          if (!ok) img.alt = '图片加载失败'
        } catch {
          img.alt = '图片加载失败'
        }
      }
    }
    loadAll()
  }, [preview, content, currentDir, currentFile])

  useEffect(() => {
    if (!preview) return
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [preview, currentDir, currentFile])

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
            handlePastedBlobs(blobs, view)
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
          doc: content,
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
  }, [preview, theme])

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

  const clearPreviewSearch = () => {
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
  }

  const applyPreviewSearch = () => {
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
  }

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
  }, [preview, searchQuery, content])

  const defaultFilePath = getDefaultFile()

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white p-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-gray-700" />
          <span className="text-sm font-medium text-gray-900">记事本</span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={chooseDir} className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center space-x-1">
            <FolderOpen className="w-3 h-3" />
            <span>选择目录</span>
          </button>
          <button onClick={openFilePicker} className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200">选择默认.md</button>
          <button onClick={refresh} className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center space-x-1">
            <RefreshCw className="w-3 h-3" />
            <span>刷新</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowSyncMenu(s => !s)} className="px-2 py-1 rounded text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200">同步 ▾</button>
            {showSyncMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded shadow p-2 z-10 min-w-[180px]">
                <div className="flex flex-col space-y-1">
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
          <button onClick={saveContent} disabled={saving} className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 hover:bg-green-200 flex items-center space-x-1">
            <Save className="w-3 h-3" />
            <span>{saving ? '保存中' : '保存'}</span>
          </button>
          <button onClick={() => setPreview(v => !v)} className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center space-x-1">
            {preview ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{preview ? '编辑' : '预览'}</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowCreate(s => !s)} className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center space-x-1">
              <Plus className="w-3 h-3" />
              <span>新建</span>
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
              className={`px-2 py-1 rounded-l text-xs flex items-center space-x-1 ${theme === 'light' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <Sun className="w-3 h-3" />
              <span>浅色</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`px-2 py-1 rounded-r text-xs flex items-center space-x-1 ${theme === 'dark' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <Moon className="w-3 h-3" />
              <span>深色</span>
            </button>
          </div>
          <div className="flex items-center space-x-1">
            <div className="flex items-center px-2 py-1 border rounded text-xs bg-white">
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
                className="outline-none bg-transparent text-gray-700 w-28"
              />
            </div>
            <button
              onClick={() => (!preview ? applyEditorSearch('prev') : gotoPreviewMatch('prev'))}
              className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => (!preview ? applyEditorSearch('next') : gotoPreviewMatch('next'))}
              className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center"
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
              className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center"
            >
              <X className="w-3 h-3" />
            </button>
            {preview && (
              <span className="text-xs text-gray-500">{previewMatchCount > 0 ? `${previewMatchIndex + 1}/${previewMatchCount}` : '0'}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden select-none">
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
          className={`${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} w-1 cursor-col-resize`}
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
                className={`w-full h-full min-h-0 border rounded p-3 prose prose-sm max-w-none ${theme === 'dark' ? 'border-gray-700 bg-gray-900 text-gray-100 prose-invert' : 'border-gray-200 bg-white text-gray-900'}`}
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
