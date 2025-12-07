import { useEffect, useState, useRef, useMemo } from 'react'
import { useNoteFilesStore } from '@/store/noteFiles'
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [childrenMap, setChildrenMap] = useState<Record<string, { entries: { name: string; path: string; isDirectory: boolean; isFile: boolean }[] }>>({})
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

  const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/')
  const joinPath = (a: string, b: string) => {
    if (!a) return b
    const sep = sepOf(a)
    return a.replace(new RegExp(`${sep}$`), '') + sep + b
  }
  const parentPath = (p: string) => {
    if (!p) return ''
    const sep = sepOf(p)
    const parts = p.split(sep)
    parts.pop()
    return parts.join(sep)
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
      const ok = await setDefaultFile(path)
      if (ok) {
        setCurrentFile(path)
        const text = await readFile(path)
        setContent(text || '')
      }
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
    } else {
      useToastStore.getState().showError('保存失败', '写入失败')
    }
  }

  const refresh = () => {
    if (currentDir) listDir(currentDir)
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
            <div className="w-full flex items-center space-x-2 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100" style={{ paddingLeft: pad }}>
              <button onClick={() => toggleExpand(e.path)} className="flex items-center">
                {expanded[e.path] ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
              </button>
              <button
                onClick={() => {
                  setCurrentDir(e.path)
                  listDir(e.path)
                }}
                className="flex items-center space-x-2 flex-1 text-left"
              >
                <FolderIcon className="w-3 h-3 text-yellow-600" />
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
              className="w-full flex items-center space-x-2 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100"
              style={{ paddingLeft: pad }}
            >
              <FileText className="w-3 h-3 text-blue-600" />
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
        tokens[idx].attrs![i][1] = safeSrc(src)
      }
      return self.renderToken(tokens, idx, options)
    }
    return md
  }

  useEffect(() => {
    mdRef.current = createMd()
  }, [])

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
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
