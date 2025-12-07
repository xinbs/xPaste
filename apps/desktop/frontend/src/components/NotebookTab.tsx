import { useEffect, useState } from 'react'
import { useNoteFilesStore } from '@/store/noteFiles'
import { useToastStore } from '@/store/toast'
import { FileText, FolderOpen, Save, RefreshCw, ArrowLeft, Folder as FolderIcon, Eye, Pencil } from 'lucide-react'

export default function NotebookTab() {
  const tree = useNoteFilesStore(s => s.tree)
  const isLoading = useNoteFilesStore(s => s.isLoading)
  const listDir = useNoteFilesStore(s => s.listDir)
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

  const escapeHtml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const sanitizeUrl = (url: string) => {
    try {
      const u = new URL(url, 'http://localhost')
      const s = u.protocol.toLowerCase()
      if (s === 'http:' || s === 'https:' || s === 'data:') return url
      return ''
    } catch {
      return ''
    }
  }

  const renderMarkdown = (md: string) => {
    let t = escapeHtml(md)
    t = t.replace(/^######\s?(.*)$/gm, '<h6>$1</h6>')
    t = t.replace(/^#####\s?(.*)$/gm, '<h5>$1</h5>')
    t = t.replace(/^####\s?(.*)$/gm, '<h4>$1</h4>')
    t = t.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>')
    t = t.replace(/^##\s?(.*)$/gm, '<h2>$1</h2>')
    t = t.replace(/^#\s?(.*)$/gm, '<h1>$1</h1>')
    t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    t = t.replace(/\*(.*?)\*/g, '<em>$1</em>')
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
    t = t.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    t = t.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, url) => {
      const u = sanitizeUrl(url)
      return u ? `<img src="${u}" alt="${alt}" />` : alt
    })
    t = t.replace(/\[(.*?)\]\((.*?)\)/g, (_, text, url) => {
      const u = sanitizeUrl(url)
      return u ? `<a href="${u}" target="_blank" rel="noopener noreferrer">${text}</a>` : text
    })
    t = t.replace(/^(\s*[-*]\s.+(?:\n\s*[-*]\s.+)*)/gm, (m) => {
      const items = m.split(/\n/).map(i => i.replace(/^\s*[-*]\s+/, ''))
      return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>'
    })
    t = t.replace(/\n{2,}/g, '</p><p>')
    t = '<p>' + t + '</p>'
    return t
  }

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
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
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
              <ul className="p-1 space-y-1">
                {tree.filter(e => e.isDirectory).map((e) => (
                  <li key={e.path}>
                    <button
                      onClick={() => {
                        const p = joinPath(currentDir, e.name)
                        setCurrentDir(p)
                        listDir(p)
                      }}
                      className="w-full flex items-center space-x-2 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100"
                    >
                      <FolderIcon className="w-3 h-3 text-yellow-600" />
                      <span className="truncate">{e.name}</span>
                    </button>
                  </li>
                ))}
                {tree.filter(e => e.isFile).map((e) => (
                  <li key={e.path}>
                    <button
                      onClick={() => openFile(e.path)}
                      className="w-full flex items-center space-x-2 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100"
                    >
                      <FileText className="w-3 h-3 text-blue-600" />
                      <span className="truncate">{e.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex-1 p-3 flex flex-col min-h-0 overflow-hidden">
          <div className="text-xs text-gray-500 mb-2">文件：{currentFile || '未选择'}</div>
          {!preview ? (
            <div className="flex-1 min-h-0 overflow-auto">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full min-h-0 resize-none border border-gray-300 rounded p-2 text-sm"
                placeholder="编辑 Markdown 内容"
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <div
                className="w-full h-full min-h-0 border border-gray-200 rounded p-3 bg-white prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content || '') }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
