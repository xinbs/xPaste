import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../utils/api'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
// ReactMarkdown 与 remarkGfm 已移除使用

// 保留占位便于后续扩展（当前未使用）
// interface NoteItem { path: string }

type TreeNode = {
  name: string
  path: string
  type: 'dir' | 'note' | 'attachment' | 'root'
  children?: TreeNode[]
}

  const NotebookManagement: React.FC = () => {
  const [notes, setNotes] = useState<string[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')
  const [content, setContent] = useState('')
  const [loadingNote, setLoadingNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [loadingAttach, setLoadingAttach] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  // 仅保留编辑器，去掉预览模式切换
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedKind, setSelectedKind] = useState<'note' | 'attachment' | 'dir-attachment' | null>(null)
  const [selectedAttachmentPath, setSelectedAttachmentPath] = useState('')
  const [selectedAttachDir, setSelectedAttachDir] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('notebook_sidebar_w') || '')
    return v && v >= 220 && v <= 640 ? v : 320
  })
  const [draggingSidebar, setDraggingSidebar] = useState(false)
  const onSidebarResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    let lastW = startW
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      lastW = Math.max(220, Math.min(640, startW + dx))
      setSidebarWidth(lastW)
    }
    const onUp = () => {
      setDraggingSidebar(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('notebook_sidebar_w', String(lastW)) } catch {}
    }
    setDraggingSidebar(true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const queryBase = useMemo(() => new URLSearchParams(), [])
  const qs = useMemo(() => {
    const s = queryBase.toString()
    return s ? `?${s}` : ''
  }, [queryBase])

  const loadNotes = async () => {
    setLoadingList(true)
    try {
      const res = await api.get(`/api/v1/notebooks${qs}`)
      const items = (res.data?.data?.items || []) as string[]
      setNotes(items)
    } catch (e) {
      console.error(e)
      setNotes([])
    } finally {
      setLoadingList(false)
    }
  }

  const loadNote = async (filename: string) => {
    setSelectedFile(filename)
    setSelectedKind('note')
    setLoadingNote(true)
    try {
      const res = await api.get(`/api/v1/notebooks/note/${encodeURI(filename)}${qs}`)
      setContent(res.data?.data?.content || '')
    } catch (e) {
      console.error(e)
      setContent('')
    } finally {
      setLoadingNote(false)
    }
  }

  const saveNote = async () => {
    if (!content.trim() || !selectedFile.trim()) return
    setSavingNote(true)
    try {
      const body = {
        filename: selectedFile.trim(),
        content
      }
      await api.post('/api/v1/notebooks/', body)
      await loadNotes()
    } finally {
      setSavingNote(false)
    }
  }

  const deleteNote = async (filename: string) => {
    try {
      await api.delete(`/api/v1/notebooks/note/${encodeURI(filename)}${qs}`)
      if (filename === selectedFile) {
        setSelectedFile('')
        setContent('')
        setSelectedKind(null)
      }
      await loadNotes()
    } catch (e) {
      console.error(e)
    }
  }

  const loadAttachments = async () => {
    setLoadingAttach(true)
    try {
      const res = await api.get(`/api/v1/notebooks/attachments${qs}`)
      setAttachments((res.data?.data?.items || []) as string[])
    } catch (e) {
      console.error(e)
      setAttachments([])
    } finally {
      setLoadingAttach(false)
    }
  }

  const uploadAttachment = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const params = new URLSearchParams()
      if (uploadName.trim()) params.set('filename', uploadName.trim())
      const dir = selectedAttachDir.trim()
      if (dir) {
        const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean)
        const knownSubdirs = ['attachments', 'assets', 'images', 'img', 'files']
        const idxSub = parts.findIndex((p) => knownSubdirs.includes(p))
        const userKey = parts[0] || ''
        const noteDir = idxSub > 1 ? parts.slice(1, idxSub).join('/') : parts.slice(1).join('/')
        const subdir = idxSub >= 0 ? parts[idxSub] : 'attachments'
        if (userKey) params.set('username', userKey)
        if (noteDir) params.set('note_dir', noteDir)
        params.set('subdir', subdir)
      }
      const suffix = params.toString() ? `?${params.toString()}` : ''
      await api.post(`/api/v1/notebooks/attachments${suffix}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadName('')
      await loadAttachments()
      const name = uploadName.trim() || file.name
      insertAttachmentMarkdown(selectedAttachDir.trim() ? `${selectedAttachDir.trim()}/${name}` : name)
    } catch (e) {
      console.error(e)
    } finally {
      setUploading(false)
    }
  }

  const deleteAttachment = async (name: string) => {
    try {
      await api.delete(`/api/v1/notebooks/attachments/${encodeURI(name)}`)
      await loadAttachments()
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    // 自动加载列表
    loadNotes()
    loadAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const makeAttachmentUrl = (name: string) => {
    const base = (api as any).defaults?.baseURL || ''
    const token = localStorage.getItem('admin_token') || ''
    if (/^https?:\/\//.test(name)) return name
    const parts = name.replace(/\\/g, '/').split('/').filter(Boolean)
    const knownSubdirs = ['attachments', 'assets', 'images', 'img', 'files']
    const hasUserRoot = parts.length > 2 && !knownSubdirs.includes(parts[0])
    if (hasUserRoot) {
      const relSafe = parts.map((seg) => encodeURIComponent(seg)).join('/')
      const params = new URLSearchParams()
      if (token) params.set('token', token)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      return `${base}/api/v1/notebooks/attachments/${relSafe}${suffix}`
    }
    const idxSub = parts.findIndex((p) => knownSubdirs.includes(p))
    const subdir = idxSub >= 0 ? parts[idxSub] : 'attachments'
    const relSegs = idxSub >= 0 ? parts.slice(idxSub + 1) : parts
    const relSafe = relSegs.map((seg) => encodeURIComponent(seg)).join('/')
    const fileSegs = selectedFile.trim() ? selectedFile.replace(/\\/g, '/').split('/').filter(Boolean) : []
    const userKey = fileSegs[0] || ''
    const relNoteSegs = fileSegs.slice(1)
    const noteDir = relNoteSegs.length > 1 ? relNoteSegs.slice(0, -1).join('/') : ''
    const params = new URLSearchParams()
    if (userKey) params.set('username', userKey)
    if (noteDir) params.set('note_dir', noteDir)
    params.set('subdir', subdir)
    if (token) params.set('token', token)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return `${base}/api/v1/notebooks/attachments/${relSafe}${suffix}`
  }

  // 移除复杂候选解析，保留单一路径解析

  const downloadUrl = (name: string) => makeAttachmentUrl(name)

  const MarkdownImage: React.FC<any> = (props) => {
    const src: string = props.src || ''
    const [visible, setVisible] = useState(true)
    if (!visible) return null
    const url = downloadUrl(src)
    return <img {...props} src={url} onError={() => setVisible(false)} className="max-w-full" />
  }

  const MarkdownLink: React.FC<any> = (props) => {
    const href: string = props.href || ''
    const resolved = /^https?:\/\//.test(href) ? href : downloadUrl(href)
    return <a {...props} href={resolved} target="_blank" rel="noreferrer" />
  }

  const insertAttachmentMarkdown = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)
    const md = isImage ? `\n![](${name})\n` : `\n[${name}](${name})\n`
    setContent((v) => (v || '') + md)
  }

  // 移除自动修复逻辑

  // 移除候选附件筛选逻辑

  // 移除单条替换/移除逻辑

  // 移除图片路径提取逻辑

  // 移除本地 blob 渲染与替换状态

  // 移除本地下载尝试与 Blob 渲染 effect

  const buildTree = (paths: string[], rootLabel: string, leafType: 'note' | 'attachment') => {
    const root: TreeNode = { name: rootLabel, path: '', type: 'root', children: [] }
    for (const p of paths) {
      const parts = p.split('/').filter(Boolean)
      let cur = root
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i]
        const isLeaf = i === parts.length - 1
        const segPath = parts.slice(0, i + 1).join('/')
        const next = (cur.children || []).find((c) => c.name === seg && (isLeaf ? c.type === leafType : c.type === 'dir'))
        if (next) {
          cur = next
        } else {
          const node: TreeNode = isLeaf ? { name: seg, path: segPath, type: leafType } : { name: seg, path: segPath, type: 'dir', children: [] }
          if (!cur.children) cur.children = []
          cur.children.push(node)
          if (!isLeaf) cur = node
        }
      }
    }
    const sortNode = (n: TreeNode) => {
      if (n.children && n.children.length > 0) {
        n.children = [...n.children].sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1
          if (a.type !== 'dir' && b.type === 'dir') return 1
          return a.name.localeCompare(b.name)
        })
        for (const c of n.children) sortNode(c)
      }
    }
    sortNode(root)
    return root
  }

  const notesTree = useMemo(() => buildTree(notes, '笔记', 'note'), [notes])
  const attTree = useMemo(() => buildTree(attachments, '附件', 'attachment'), [attachments])

  const isImageName = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)
  }

  const renderTree = (node: TreeNode, depth = 0) => {
    const padding = { paddingLeft: `${8 + depth * 12}px` }
    if (node.type === 'root') {
      return (
        <div key={`root-${node.name}`}>
          <div className="px-2 py-1 text-xs font-semibold text-gray-600">{node.name}</div>
          {(node.children || []).map((c) => renderTree(c, 0))}
        </div>
      )
    }
    if (node.type === 'dir') {
      const key = `dir:${node.path}`
      const open = !!expanded[key]
      return (
        <div key={key}>
          <div className={`flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded px-2 py-1 ${selectedKind === 'dir-attachment' && selectedAttachDir === node.path ? 'bg-blue-50 text-blue-700' : 'text-gray-800'}`} style={padding} onClick={() => {
            setExpanded((e) => ({ ...e, [key]: !open }))
            setSelectedKind('dir-attachment')
            setSelectedAttachDir(node.path)
          }}>
            <span className="text-xs">{open ? '📂' : '📁'} {node.name}</span>
          </div>
          {open && (
            <div className="ml-2">{(node.children || []).map((c) => renderTree(c, depth + 1))}</div>
          )}
        </div>
      )
    }
    const key = `${node.type}:${node.path}`
    const active = (selectedKind === 'note' && selectedFile === node.path) || (selectedKind === 'attachment' && selectedAttachmentPath === node.path)
    return (
      <div key={key} className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer ${active ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-800'}`} style={padding} onClick={() => {
        if (node.type === 'note') {
          loadNote(node.path)
        } else {
          setSelectedKind('attachment')
          setSelectedAttachmentPath(node.path)
          setSelectedAttachDir(node.path.split('/').slice(0, -1).join('/'))
        }
      }}>
        <span className="text-xs">{node.type === 'note' ? '📝' : (isImageName(node.name) ? '🖼️' : '📎')} {node.name}</span>
        <div className="flex items-center gap-1">
          {node.type === 'note' ? (
            <button className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white rounded" onClick={(e) => { e.stopPropagation(); deleteNote(node.path) }}>删除</button>
          ) : (
            <button className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white rounded" onClick={(e) => { e.stopPropagation(); deleteAttachment(node.path) }}>删除</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">笔记管理</h1>
        <p className="mt-1 text-gray-600 text-sm">以资源管理器形式管理 Markdown 与附件</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button onClick={() => { loadNotes(); loadAttachments(); }} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm" disabled={loadingList || loadingAttach}>
              {loadingList || loadingAttach ? '刷新中...' : '刷新'}
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <input type="text" value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="文件名(可选)" className="px-2 py-1.5 border rounded text-sm" />
            <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment(f) }} className="text-sm" />
            <button onClick={loadAttachments} className="px-3 py-1.5 bg-gray-100 rounded text-sm" disabled={loadingAttach || uploading}>{loadingAttach ? '刷新中...' : '刷新附件'}</button>
          </div>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="bg-white rounded-lg shadow" style={{ width: sidebarWidth }}>
          <div className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">资源管理器</h3>
            </div>
          </div>
          <div className="p-2 max-h-[540px] overflow-auto">
            {renderTree(notesTree)}
            <div className="mt-2"/>
            {renderTree(attTree)}
          </div>
        </div>
        <div className={`hidden lg:block w-1 ${draggingSidebar ? 'bg-blue-400' : 'bg-gray-200 hover:bg-gray-300'} cursor-col-resize`} onMouseDown={onSidebarResizeMouseDown} />
        <div className="bg-white rounded-lg shadow flex-1">
          <div className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">内容</h3>
              {selectedKind === 'note' && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">{selectedFile || '未选择文件'}</span>
                  {loadingNote && <span className="text-xs text-gray-400">加载中...</span>}
                </div>
              )}
              {selectedKind === 'attachment' && (
                <div className="flex items-center space-x-2">
                  <a href={downloadUrl(selectedAttachmentPath)} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 bg-gray-100 rounded">下载</a>
                  <button className="text-xs px-2 py-1 bg-gray-100 rounded" onClick={() => insertAttachmentMarkdown(selectedAttachmentPath)}>插入到笔记</button>
                </div>
              )}
            </div>
          </div>
            <div className="p-4 space-y-3">
              {selectedKind === 'note' && (
                <div>
                {loadingNote ? (
                  <div className="border rounded p-2 text-sm bg-gray-50 h-[480px] flex items-center justify-center">加载中...</div>
                ) : (
                  <MDEditor
                    value={content}
                    onChange={(v) => setContent(v || '')}
                    height={480}
                    previewOptions={{
                      components: {
                        img: MarkdownImage as any,
                        a: MarkdownLink as any
                      }
                    }}
                  />
                )}
                <div className="flex justify-end space-x-2 mt-3">
                  <button className="px-3 py-1.5 bg-gray-100 rounded text-sm" onClick={() => setContent('')}>清空</button>
                  <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm" onClick={saveNote} disabled={loadingNote || savingNote || !selectedFile.trim() || !content.trim()}>
                    {savingNote ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
              )}
            {selectedKind === 'attachment' && (
              <div className="border rounded p-2 text-sm bg-gray-50 max-h-[520px] overflow-y-auto">
                {isImageName(selectedAttachmentPath) ? (
                  <img src={downloadUrl(selectedAttachmentPath)} alt={selectedAttachmentPath} className="max-w-full" />
                ) : (
                  <a href={downloadUrl(selectedAttachmentPath)} target="_blank" rel="noreferrer" className="text-blue-600">{selectedAttachmentPath}</a>
                )}
              </div>
            )}
            {!selectedKind && (
              <div className="text-sm text-gray-500">从左侧选择文件或目录</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default NotebookManagement
