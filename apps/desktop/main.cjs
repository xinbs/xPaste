const { app, BrowserWindow, Menu, shell, ipcMain, dialog, Tray, nativeImage, clipboard, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// 关闭按钮行为：'minimize' | 'hide' | 'quit'
let userCloseBehavior = 'minimize';
// Token 存储模式：默认磁盘，可通过环境变量切换为内存
// 可选值：'disk' | 'memory'
const TOKEN_STORAGE_MODE = (process.env.TOKEN_STORAGE || 'disk').toLowerCase();

// Token 持久化相关逻辑
const TOKEN_FILE_NAME = 'auth-token.json';

function getTokenPath() {
  const userDataPath = app.getPath('userData');
  // 确保 userData 目录存在
  if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, TOKEN_FILE_NAME);
}

function saveTokenToDisk(token) {
  try {
    const tokenPath = getTokenPath();
    fs.writeFileSync(tokenPath, JSON.stringify({ token }), 'utf-8');
    console.log('Token 已保存到本地磁盘:', tokenPath);
  } catch (error) {
    console.error('保存 Token 到磁盘失败:', error);
  }
}

function loadTokenFromDisk() {
  try {
    const tokenPath = getTokenPath();
    console.log('尝试从磁盘加载 Token，路径:', tokenPath);
    if (fs.existsSync(tokenPath)) {
      const data = fs.readFileSync(tokenPath, 'utf-8');
      console.log('Token 文件内容:', data);
      const parsed = JSON.parse(data);
      if (parsed && parsed.token) {
        console.log('从本地磁盘成功加载 Token');
        return parsed.token;
      } else {
          console.log('Token 文件格式不正确或 Token 为空');
      }
    } else {
        console.log('Token 文件不存在');
    }
  } catch (error) {
    console.error('从磁盘加载 Token 失败:', error);
  }
  return null;
}

const WINDOW_STATE_FILE_NAME = 'window-state.json';

function getWindowStatePath() {
  const userDataPath = app.getPath('userData');
  try { if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true }); } catch {}
  return path.join(userDataPath, WINDOW_STATE_FILE_NAME);
}

function loadWindowState() {
  try {
    const p = getWindowStatePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const w = Number(data?.width) || 400;
      const h = Number(data?.height) || 600;
      const x = typeof data?.x === 'number' ? data.x : undefined;
      const y = typeof data?.y === 'number' ? data.y : undefined;
      return { width: w, height: h, x, y };
    }
  } catch {}
  return { width: 400, height: 600 };
}

function saveWindowStateFrom(win) {
  try {
    if (!win) return;
    const normal = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    const data = { width: normal.width, height: normal.height, x: normal.x, y: normal.y };
    const p = getWindowStatePath();
    fs.writeFileSync(p, JSON.stringify(data));
  } catch {}
}

// 跨平台图标路径获取函数
function getWindowIcon() {
  const platform = process.platform;
  const assetsDir = path.join(__dirname, 'assets');
  const resourcesDir = process.resourcesPath || path.dirname(app.getPath('exe'));
  
  // Windows: 优先使用 ICO，备用 PNG
  if (platform === 'win32') {
    const icoPaths = [
      path.join(assetsDir, 'icon.ico'),
      path.join(assetsDir, 'icon.png'),
      path.join(assetsDir, 'icon.svg')
    ];
    
    for (const iconPath of icoPaths) {
      if (fs.existsSync(iconPath)) {
        console.log('Windows 窗口图标:', iconPath);
        return iconPath;
      }
    }
  }
  
  // macOS: 优先使用 ICNS，备用 PNG/SVG
  else if (platform === 'darwin') {
    const macPaths = [
      // 打包后的正确位置：Resources 下的 icns
      path.join(resourcesDir, 'icon.icns'),
      // 开发/备用：assets 内的 icns/png/svg
      path.join(assetsDir, 'icon.icns'),
      path.join(assetsDir, 'icon.png'),
      path.join(assetsDir, 'icon.svg')
    ];
    
    for (const iconPath of macPaths) {
      if (fs.existsSync(iconPath)) {
        console.log('macOS 窗口图标:', iconPath);
        return iconPath;
      }
    }
  }
  
  // Linux: 优先使用 PNG，备用 SVG
  else {
    const linuxPaths = [
      path.join(assetsDir, 'icon.png'),
      path.join(assetsDir, 'icon.svg')
    ];
    
    for (const iconPath of linuxPaths) {
      if (fs.existsSync(iconPath)) {
        console.log('Linux 窗口图标:', iconPath);
        return iconPath;
      }
    }
  }
  
  // 最后备用
  const fallback = path.join(assetsDir, 'icon.svg');
  console.log('使用备用图标:', fallback);
  return fallback;
}

// （已移除未使用的图片加载辅助方法）

// 跨平台托盘图标获取函数
function getTrayIconPaths() {
  const platform = process.platform;
  const assetsDir = path.join(__dirname, 'assets');
  const resourcesPath = process.resourcesPath || path.dirname(app.getPath('exe'));
  
  const paths = [];
  
  if (platform === 'win32') {
    // Windows: ICO 格式最佳
    paths.push(
      // 开发环境
      path.join(assetsDir, 'icon.ico'),
      path.join(assetsDir, 'tray-icon.ico'),
      // 打包后环境
      path.join(resourcesPath, 'icon.ico'),
      path.join(path.dirname(app.getPath('exe')), 'resources', 'icon.ico'),
      // PNG 备用
      path.join(assetsDir, 'tray-icon.png'),
      path.join(assetsDir, 'icon.png')
    );
  } else if (platform === 'darwin') {
    // macOS: PNG 格式，16x16 和 32x32，Template 图标适配明暗主题
    paths.push(
      path.join(assetsDir, 'tray-icon-template.svg'), // 优先使用 SVG Template
      path.join(assetsDir, 'tray-iconTemplate.png'), // macOS 推荐的 Template 图标
      path.join(assetsDir, 'tray-icon.png'),
      path.join(assetsDir, 'icon.png'),
      path.join(resourcesPath, 'tray-icon.png')
    );
  } else {
    // Linux: PNG 格式
    paths.push(
      path.join(assetsDir, 'tray-icon.png'),
      path.join(assetsDir, 'icon.png'),
      path.join(resourcesPath, 'tray-icon.png')
    );
  }
  
  // SVG 作为最后备用（所有平台）
  paths.push(path.join(assetsDir, 'icon.svg'));
  
  return paths;
}

// 创建跨平台备用图标
function createFallbackTrayIcon() {
  const platform = process.platform;
  
  // 根据平台设置不同的尺寸
  let width, height;
  if (platform === 'linux') {
    width = height = 22;  // Linux 常用尺寸
  } else {
    width = height = 16;  // Windows 和 macOS
  }
  
  const buffer = Buffer.alloc(width * height * 4);
  
  // 创建一个简洁的 "X" 图案（xPaste 的 x）
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      
      // 绘制 X 图案，适配不同尺寸
      const center = width / 2;
      const thickness = Math.max(1, Math.floor(width / 16));
      const margin = Math.floor(width * 0.2);
      
      const isX = (
        (Math.abs(x - y) <= thickness || Math.abs(x - (height - 1 - y)) <= thickness) &&
        (x >= margin && x < width - margin && y >= margin && y < height - margin)
      );
      
      if (isX) {
        if (platform === 'darwin') {
          // macOS: 使用黑色，适配 Template 风格
          buffer[i] = 0;       // B - 黑色
          buffer[i + 1] = 0;   // G
          buffer[i + 2] = 0;   // R
          buffer[i + 3] = 255; // A
        } else {
          // Windows/Linux: 使用品牌色 #7C3AED
          buffer[i] = 237;     // B
          buffer[i + 1] = 58;  // G
          buffer[i + 2] = 124; // R
          buffer[i + 3] = 255; // A
        }
      } else {
        // 透明背景
        buffer[i] = 0;
        buffer[i + 1] = 0;
        buffer[i + 2] = 0;
        buffer[i + 3] = 0;
      }
    }
  }
  
  const img = nativeImage.createFromBuffer(buffer, { width, height });
  
  // macOS Template 图标设置
  if (platform === 'darwin') {
    img.setTemplateImage(true);
  }
  
  console.log(`✅ 创建 ${platform} 备用托盘图标 (${width}x${height})`);
  return img;
}

// 保持对窗口对象的全局引用，如果不这样做，当JavaScript对象被垃圾回收时，窗口将自动关闭
let mainWindow;
let tray;
let currentHotkeys = { show_window: '' };

// 剪贴板监控相关变量
let clipboardMonitorInterval;
let lastClipboardText = '';
let lastClipboardImage = '';
let lastClipboardFileHash = '';
let recentFileHashTimes = new Map();
const FILE_DUP_TTL_MS = 8000;

// API 相关
let authToken = null;
// 允许从渲染进程动态同步 API 基地址；默认指向本地开发服务
let apiBaseUrl = 'http://localhost:8080/api/v1';
// 待保存队列
let pendingSaveQueue = [];

function flushPendingQueue() {
  try {
    if (!authToken || pendingSaveQueue.length === 0) return;
    console.log(`发现 ${pendingSaveQueue.length} 个待保存项目，开始处理...`);
    const queue = [...pendingSaveQueue];
    pendingSaveQueue = [];
    queue.forEach(item => {
      saveClipItemToApi(item.type, item.content, item.filePath).then(saved => {
        if (saved && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard-changed', {
            type: item.type,
            content: item.content,
            timestamp: item.timestamp,
            savedByMain: true
          });
        }
      });
    });
  } catch (err) {
    console.error('处理待保存队列时出错:', err);
  }
}
async function saveClipItemToApi(type, content, filePath) {
  if (!authToken) {
    // 仅在磁盘模式下尝试从磁盘恢复 Token
    if (TOKEN_STORAGE_MODE === 'disk') {
      const diskToken = loadTokenFromDisk();
      if (diskToken) {
          authToken = diskToken;
          console.log('从磁盘恢复 Token，继续保存...');
          if (pendingSaveQueue.length > 0) {
            flushPendingQueue();
          }
      } else {
          console.warn('主进程尝试保存剪贴板，但 AuthToken 未设置。将数据加入待保存队列。');
          
          // 加入队列
          if (!pendingSaveQueue.some(i => i.type === type && i.content === content)) {
            pendingSaveQueue.push({ type, content, filePath, timestamp: Date.now() });
          }
          
          // 尝试请求 Token
          if (mainWindow && !mainWindow.isDestroyed()) {
              console.log('主进程向渲染进程请求 Token...');
              mainWindow.webContents.send('request-token');
          }
          return false;
      }
    } else {
      // 内存模式：直接入队并请求渲染进程提供 Token
      console.warn('主进程尝试保存剪贴板，但 AuthToken 未设置（内存模式）。将数据加入待保存队列。');
      if (!pendingSaveQueue.some(i => i.type === type && i.content === content)) {
        pendingSaveQueue.push({ type, content, filePath, timestamp: Date.now() });
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('主进程向渲染进程请求 Token（内存模式）...');
        mainWindow.webContents.send('request-token');
      }
      return false;
    }
  }
  
  try {
    if (type === 'text') {
      const preview = (content || '').replace(/\s+/g, ' ').slice(0, 80);
      console.log('主进程正在保存文本内容...', {
        length: (content || '').length,
        preview
      });
    } else if (type === 'image') {
      console.log('主进程正在保存图片内容...', {
        dataUrlLength: (content || '').length
      });
    } else {
      console.log(`主进程正在保存 ${type} 类型剪贴板内容...`);
    }
    const response = await fetch(`${apiBaseUrl}/clips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        type,
        content,
        file_path: filePath,
        metadata: {
          source: 'desktop_main_process',
          auto_detected: true,
          timestamp: new Date().toISOString()
        }
      })
    });
    
    if (response.ok) {
      console.log('主进程 API 保存成功');
      return true;
    } else {
      console.error('主进程 API 保存失败:', response.status);
      return false;
    }
  } catch (err) {
    console.error('主进程 API 请求错误:', err);
    return false;
  }
}

function startClipboardMonitoring(window) {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
  }

  // 初始化当前剪贴板内容，避免启动时重复发送
  lastClipboardText = clipboard.readText();
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    lastClipboardImage = img.toDataURL();
  }

  // 启动监控时打印一次上下文
  try {
    const previewText = (lastClipboardText || '').replace(/\s+/g, ' ').slice(0, 80);
    const imgSize = img && !img.isEmpty() ? img.getSize() : { width: 0, height: 0 };
    console.log(
      '启动主进程剪贴板监控...',
      {
        windowVisible: !!window && !window.isDestroyed() ? window.isVisible() : false,
        windowFocused: !!window && !window.isDestroyed() ? window.isFocused() : false,
        initialTextLength: (lastClipboardText || '').length,
        initialTextPreview: previewText,
        initialImageLength: (lastClipboardImage || '').length,
        initialImageSize: imgSize,
      }
    );
  } catch (e) {
    console.warn('启动监控时记录上下文失败:', e);
  }

  clipboardMonitorInterval = setInterval(() => {
    if (!window || window.isDestroyed()) return;

    // 1. 先检查文件剪贴板（避免将文件图标误识别为图片或文件名文本）
    try {
      const bufFileUrl = clipboard.readBuffer('public.file-url');
      const bufNsFiles = clipboard.readBuffer('NSFilenamesPboardType');
      let raw = '';
      if (bufFileUrl && bufFileUrl.length > 0) {
        raw = bufFileUrl.toString('utf8');
      } else if (bufNsFiles && bufNsFiles.length > 0) {
        raw = bufNsFiles.toString('utf8');
      }
      if (raw && raw.trim().length > 0) {
        const parts = raw.split(/[\r\n\u0000]+/).filter(Boolean);
        const paths = parts.map(p => {
          try {
            if (p.startsWith('file://')) {
              const u = new URL(p);
              return decodeURI(u.pathname);
            }
            return decodeURI(p);
          } catch {
            return p;
          }
        }).filter(Boolean);
        // 为稳定去重，排序后拼接
        const hash = paths.slice().sort().join('|');
        const now = Date.now();
        const lastTime = recentFileHashTimes.get(hash) || 0;
        if (hash && (hash !== lastClipboardFileHash || now - lastTime > FILE_DUP_TTL_MS)) {
          recentFileHashTimes.set(hash, now);
          lastClipboardFileHash = hash;
          try { lastClipboardText = clipboard.readText() || lastClipboardText } catch {}
          lastClipboardImage = '';
        }
        // 有文件时，直接返回，避免文本/图片分支重复记录
        return;
      }
    } catch (_) { /* ignore */ }

    // 2. 检查文本
    const text = clipboard.readText();
    if (text && text !== lastClipboardText) {
      lastClipboardText = text;
      // 清除图片记录，因为剪贴板内容已变为文本
      lastClipboardImage = ''; 
      lastClipboardFileHash = '';
      
      const preview = text.replace(/\s+/g, ' ').slice(0, 120);
      try {
        console.log('检测到剪贴板文本变化 (后台监控)', {
          length: text.length,
          preview,
          windowVisible: !!window && !window.isDestroyed() ? window.isVisible() : false,
          windowFocused: !!window && !window.isDestroyed() ? window.isFocused() : false,
        });
      } catch (_) {}
      
      // 尝试直接保存
      saveClipItemToApi('text', text).then(saved => {
        if (!window || window.isDestroyed()) return;
        console.log('准备发送 IPC 到渲染进程: clipboard-changed(text)', {
          savedByMain: saved,
          contentLength: text.length
        });
        window.webContents.send('clipboard-changed', {
          type: 'text',
          content: text,
          timestamp: Date.now(),
          savedByMain: saved
        });
      });
      
      return;
    }

    // 3. 检查图片 (仅当没有文本/文件时)
    // 通常剪贴板要么是文本要么是图片
    // 读取图片比较耗资源，这里做一个简单的优化：如果文本没变且为空，或者文本没变但我们之前是图片，则检查图片
    
    // 简单的策略：总是检查图片，但为了性能，可以限制频率或只在文本为空时检查？
    // 为了完整性，我们检查图片。
    // 注意：clipboard.readImage() 在某些平台上可能比较慢
    
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const imageDataUrl = image.toDataURL();
      if (imageDataUrl !== lastClipboardImage) {
        lastClipboardImage = imageDataUrl;
        // 清除文本记录
        lastClipboardText = '';
        lastClipboardFileHash = '';
        
        try {
          const size = image.getSize();
          console.log('检测到剪贴板图片变化 (后台监控)', {
            dataUrlLength: imageDataUrl.length,
            width: size.width,
            height: size.height,
            windowVisible: !!window && !window.isDestroyed() ? window.isVisible() : false,
            windowFocused: !!window && !window.isDestroyed() ? window.isFocused() : false,
          });
        } catch (_) {}
        
        // 尝试直接保存
        saveClipItemToApi('image', imageDataUrl).then(saved => {
          if (!window || window.isDestroyed()) return;
          console.log('准备发送 IPC 到渲染进程: clipboard-changed(image)', {
            savedByMain: saved,
            dataUrlLength: imageDataUrl.length
          });
          window.webContents.send('clipboard-changed', {
            type: 'image',
            content: imageDataUrl,
            timestamp: Date.now(),
            savedByMain: saved
          });
        });
      }
    }
  }, 1000); // 每秒检查一次
}

function createWindow() {
  const initState = loadWindowState();
  mainWindow = new BrowserWindow({
    width: initState.width,
    height: initState.height,
    minWidth: 320,        // 最小宽度限制，保证基本可用性
    minHeight: 400,       // 最小高度
    // maxWidth: 800,        // 最大宽度限制，避免过宽
    resizable: true,      // 允许调整大小
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      // 性能优化：禁用后台节流，确保剪贴板监控在窗口隐藏时也能正常工作
      backgroundThrottling: false
    },
    icon: getWindowIcon(),
    show: true,
    // 根据环境模式设置窗口样式
    frame: isDev,  // 只在开发模式显示完整框架
    titleBarStyle: process.platform === 'darwin' 
      ? (isDev ? 'default' : 'hiddenInset')         // macOS: 开发模式默认，生产模式隐藏
      : (isDev ? 'default' : 'hidden'),             // Windows: 开发模式默认，生产模式隐藏
    titleBarOverlay: !isDev && process.platform === 'win32' ? {
      color: '#ffffff',
      symbolColor: '#374151', 
      height: 30,
      // 控制按钮样式
      backgroundColor: '#f9fafb'
    } : undefined,
    x: initState.x,
    y: initState.y,
    // 窗口样式优化
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    // Windows 特定设置
    ...(process.platform === 'win32' && !isDev && {
      // Windows 无框窗口的额外设置在 titleBarOverlay 中已定义
    })
  });

  // 生产模式下隐藏菜单栏
  if (!isDev) {
    mainWindow.setMenuBarVisibility(false);
  }

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // 开发模式下打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // 渲染流程事件监控，便于定位生产环境空白窗口问题
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[main] did-finish-load 渲染完成');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[main] did-fail-load 加载失败', { errorCode, errorDescription, validatedURL, isMainFrame });
    try {
      dialog.showErrorBox('页面加载失败', `${errorDescription} (code: ${errorCode})\nURL: ${validatedURL || 'file://index.html'}`);
    } catch (_) {}
  });

  // 窗口准备好后显示（show:true 已提前显示，这里保证绘制完成后聚焦）
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 如果是开发模式，聚焦到窗口
    if (isDev) {
      mainWindow.focus();
    }

    // 向渲染进程请求当前服务器配置，确保主进程握手后持有最新 API 地址
    try {
      mainWindow.webContents.send('request-server-config');
    } catch (e) {
      console.warn('请求服务器配置失败:', e);
    }

    // 内存模式下，主动请求渲染进程提供 Token
    if (TOKEN_STORAGE_MODE === 'memory') {
      try {
        mainWindow.webContents.send('request-token');
      } catch (e) {
        console.warn('请求 Token 失败:', e);
      }
    }

    // 启动剪贴板监控
    startClipboardMonitoring(mainWindow);
  });

  // 监听窗口显示/隐藏事件，控制 Dock 图标 (仅 macOS)
  if (process.platform === 'darwin') {
    mainWindow.on('show', () => {
      app.dock.show().then(() => {
        // 再次设置 Dock 图标，防止变回默认图标
        const iconPath = getWindowIcon();
        try {
          const img = nativeImage.createFromPath(iconPath);
          if (img && !img.isEmpty()) {
            app.dock.setIcon(img);
          } else {
            console.warn('Dock 图标加载为空，路径:', iconPath);
          }
        } catch (e) {
          console.warn('重设 Dock 图标失败:', iconPath, e?.message || e);
        }
        console.log('恢复窗口显示，重设 Dock 图标:', iconPath);
      }).catch(err => console.error('Failed to show dock icon:', err));
    });
    
    mainWindow.on('hide', () => {
      // 当按“隐藏窗口(保留 Dock)”时，不隐藏 Dock
      if (userCloseBehavior !== 'hide') {
        app.dock.hide();
      }
    });
  }

  // 监听窗口状态变化
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-unmaximized');
    try { saveWindowStateFrom(mainWindow) } catch {}
  });

  // 最小化时按需隐藏 Dock（macOS）
  mainWindow.on('minimize', () => {
    if (process.platform === 'darwin' && userCloseBehavior === 'minimize') {
      app.dock.hide();
    }
  });

  // 窗口关闭时隐藏到托盘而不是退出
  mainWindow.on('close', (event) => {
    try { saveWindowStateFrom(mainWindow) } catch {}
    if (app.isQuiting) {
      return;
    }

    // 根据用户配置执行不同的行为
    if (userCloseBehavior === 'quit') {
      // 允许默认关闭行为，退出应用
      app.isQuiting = true;
      return;
    }

    // 拦截默认关闭
    event.preventDefault();
    if (userCloseBehavior === 'minimize') {
      mainWindow.minimize();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    } else {
      // 默认：隐藏窗口
      mainWindow.hide();
    }

    // 显示提示气泡（仅在托盘存在时）
    if (tray && !tray.isDestroyed()) {
      try {
        tray.displayBalloon({
          iconType: 'info',
          title: 'xPaste',
          content: '应用已最小化到系统托盘'
        });
      } catch (_) {}
    }
  });

  // 当窗口关闭时触发
  mainWindow.on('closed', () => {
    // 取消引用window对象，如果你的应用支持多窗口，
    // 通常会把多个window对象存放在一个数组里，
    // 与此同时，你应该删除相应的元素。
    mainWindow = null;
  });

  try {
    mainWindow.on('resize', () => { saveWindowStateFrom(mainWindow) });
    mainWindow.on('move', () => { saveWindowStateFrom(mainWindow) });
  } catch {}

  // 处理外部链接与预览窗口
  // 默认策略：
  // - 允许 renderer 用 window.open('about:blank') 创建本地预览窗口（用于图片查看）
  // - 对 http/https 链接使用外部浏览器打开并阻止新窗口
  // - 允许 data:/blob: 这类安全的本地预览 URL
  // - 其余协议一律阻止
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      // 允许空或 about: 开头的窗口（renderer 会写入内容用于预览）
      if (!url || url.startsWith('about:')) {
        return { action: 'allow' };
      }

      // 允许本地预览相关的协议
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        return { action: 'allow' };
      }

      // 对外部 http/https 链接，改为外部打开
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }

      // 其他协议默认阻止
      return { action: 'deny' };
    } catch (err) {
      // 对异常情况保持保守策略：只允许 about:blank，其余阻止
      if (url === 'about:blank') {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    }
  });
}

// 统一使用主界面设置标签，无需独立设置窗口

// 显示并聚焦主窗口
function showMainWindow() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }
    // 避免 macOS 上的“还原”动画：在 macOS 不调用 restore
    if (mainWindow.isMinimized()) {
      if (process.platform !== 'darwin') {
        mainWindow.restore();
      } else {
        // 在 macOS，如果窗口处于最小化状态，先隐藏再显示，规避动画
        try { mainWindow.hide(); } catch (_) {}
      }
    }
    mainWindow.show();
    mainWindow.focus();
  } catch (err) {
    console.warn('显示主窗口失败:', err);
  }
}

// 注册“呼出主程序”快捷键
function registerShowWindowHotkey(accelerator) {
  try {
    if (!accelerator || typeof accelerator !== 'string') {
      console.warn('无效的快捷键加速字符串:', accelerator);
      return { success: false, error: '无效的快捷键' };
    }

    // 取消之前的注册
    if (currentHotkeys.show_window) {
      try { globalShortcut.unregister(currentHotkeys.show_window); } catch (_) {}
    }

    // 注册新的快捷键
    const ok = globalShortcut.register(accelerator, () => {
      showMainWindow();
    });

    if (!ok) {
      console.error('注册快捷键失败:', accelerator);
      return { success: false, error: '注册失败，快捷键可能被系统占用或无效' };
    }

    currentHotkeys.show_window = accelerator;
    console.log('已注册呼出主程序快捷键:', accelerator);
    return { success: true };
  } catch (err) {
    console.error('注册快捷键异常:', err);
    return { success: false, error: err?.message || '未知错误' };
  }
}

// 创建系统托盘
function createTray() {
  let trayIcon;
  
  console.log('Creating tray icon for platform:', process.platform);
  
  // 使用跨平台图标路径函数
  const iconCandidates = getTrayIconPaths();
  
  // 尝试加载图标，优先级从高到低
  for (const iconPath of iconCandidates) {
    try {
      console.log('尝试加载托盘图标:', iconPath);
      
      // 检查文件是否存在
      if (!fs.existsSync(iconPath)) {
        console.log('图标文件不存在:', iconPath);
        continue;
      }
      
      const img = nativeImage.createFromPath(iconPath);
      
      if (img && !img.isEmpty()) {
        // 根据平台和文件类型调整图标
        if (process.platform === 'darwin') {
          // macOS: 使用原始尺寸，系统会自动缩放，Template 图标自动适配主题
          if (iconPath.match(/template/i)) {
            // 如果是 SVG，不要强制 resize，这可能会导致模糊或丢失矢量特性
            // 只有当图片尺寸确实过大时才 resize
            const size = img.getSize();
            if (size.width > 24 || size.height > 24) {
              trayIcon = img.resize({ width: 16, height: 16 });
            } else {
              trayIcon = img;
            }
            trayIcon.setTemplateImage(true);
            console.log('✅ 成功加载 macOS Template 托盘图标:', iconPath);
          } else {
            trayIcon = img.resize({ width: 16, height: 16 });
            console.log('✅ 成功加载 macOS 托盘图标:', iconPath);
          }
          break;
        } 
        else if (process.platform === 'win32') {
          // Windows: ICO 最佳，PNG 次之
          if (iconPath.endsWith('.ico')) {
            trayIcon = img.resize({ width: 16, height: 16 });
            console.log('✅ 成功加载 Windows ICO 托盘图标:', iconPath);
          } else {
            trayIcon = img.resize({ width: 16, height: 16 });
            console.log('✅ 成功加载 Windows 托盘图标:', iconPath);
          }
          break;
        }
        else {
          // Linux: PNG 格式，22x22 或 24x24 较常见
          trayIcon = img.resize({ width: 22, height: 22 });
          console.log('✅ 成功加载 Linux 托盘图标:', iconPath);
          break;
        }
      }
    } catch (error) {
      console.log('加载图标失败:', iconPath, error.message);
      continue;
    }
  }
  
  // 如果所有图标都加载失败，创建跨平台备用图标
  if (!trayIcon || trayIcon.isEmpty()) {
    console.log('所有图标加载失败，创建跨平台备用图标');
    trayIcon = createFallbackTrayIcon();
  }

  tray = new Tray(trayIcon);
  
  // 创建托盘菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '剪贴板监控',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        // 通过 IPC 通知渲染进程切换监控状态
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('toggle-clipboard-monitoring', menuItem.checked);
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '打开设置',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
          // 切换到设置标签页
          mainWindow.webContents.send('switch-to-tab', 'settings');
        }
      }
    },
    {
      label: '查看历史记录',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
          // 切换到历史记录标签页
          mainWindow.webContents.send('switch-to-tab', 'clipboard');
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '关于 xPaste',
      click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '关于 xPaste',
          message: 'xPaste - 跨设备剪贴板同步工具',
          detail: 'Version: 1.0.0\n\n一个强大的剪贴板管理和同步工具，支持跨设备同步、OCR 识别等功能。',
          buttons: ['确定']
        });
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出应用',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('xPaste - 剪贴板管理工具');
  
  // 双击托盘图标显示/隐藏主窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  // 仅在磁盘模式下尝试从磁盘加载 Token
  if (TOKEN_STORAGE_MODE === 'disk') {
    const diskToken = loadTokenFromDisk();
    if (diskToken) {
        authToken = diskToken;
        console.log('应用启动：已从磁盘恢复 Token');
        if (pendingSaveQueue.length > 0) {
          flushPendingQueue();
        }
    }
  } else {
    console.log('应用启动：Token 内存模式，启动后不从磁盘加载');
  }

  // 显式设置 Dock 图标（macOS）
  if (process.platform === 'darwin') {
    const iconPath = getWindowIcon();
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (img && !img.isEmpty()) {
        app.dock.setIcon(img);
      } else {
        console.warn('初始 Dock 图标加载为空，路径:', iconPath);
      }
    } catch (e) {
      console.warn('设置 Dock 图标失败:', iconPath, e?.message || e);
    }
    console.log('设置 Dock 图标:', iconPath);
  }
  
  // 监听渲染进程日志
  ipcMain.on('renderer-log', (event, message, data) => {
    if (data) {
      console.log(`[Renderer] ${message}`, data);
    } else {
      console.log(`[Renderer] ${message}`);
    }
  });

  // 监听 Token 同步
  ipcMain.on('sync-token', (event, token) => {
    authToken = token;
    if (TOKEN_STORAGE_MODE === 'disk') {
      saveTokenToDisk(token); // 保存到磁盘
      console.log('主进程已更新 Token 并保存到磁盘');
    } else {
      console.log('主进程已更新 Token（内存模式，不写入磁盘）');
    }
    
    flushPendingQueue();
  });

  // 监听服务器配置同步（例如 API 基地址）
  ipcMain.on('sync-server-config', (event, config) => {
    try {
      if (config && typeof config.apiBaseUrl === 'string' && config.apiBaseUrl.trim().length > 0) {
        apiBaseUrl = config.apiBaseUrl.trim();
        console.log('主进程已更新 API 基地址:', apiBaseUrl);
      } else if (config && typeof config.baseUrl === 'string') {
        // 兼容仅传递 baseUrl 的情况
        apiBaseUrl = `${config.baseUrl.replace(/\/$/, '')}/api/v1`;
        console.log('主进程已根据 baseUrl 更新 API 基地址:', apiBaseUrl);
      } else {
        console.warn('sync-server-config 收到的配置无效:', config);
      }
    } catch (err) {
      console.error('同步服务器配置失败:', err);
    }
  });

  createWindow();
  createTray();

  // 注册默认快捷键，用户可在设置页更改
  const defaultAccelerator = (process.platform === 'darwin') ? 'CmdOrCtrl+Shift+V' : 'Ctrl+Shift+V';
  registerShowWindowHotkey(defaultAccelerator);

  // 在macOS上，当点击dock图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // 设置应用菜单
  createMenu();
});

// 当所有窗口都关闭时退出应用
app.on('window-all-closed', () => {
  // 在macOS上，应用程序及其菜单栏通常保持活动状态，
  // 直到用户使用Cmd + Q明确退出
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 在此文件中，你可以包含应用程序剩余的所有主进程代码。
// 也可以拆分成几个文件，然后用require导入。

// 创建应用菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // 发送新建事件到渲染进程
            if (mainWindow) {
              mainWindow.webContents.send('menu-new');
            }
          }
        },
        { type: 'separator' },
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) {
                mainWindow.restore();
              }
              mainWindow.show();
              mainWindow.focus();
              // 切换到设置标签页
              mainWindow.webContents.send('switch-to-tab', 'settings');
            }
          }
        },
        { type: 'separator' },
        {
          label: '导入设置',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'JSON Files', extensions: ['json'] }
              ]
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu-import-settings', result.filePaths[0]);
            }
          }
        },
        {
          label: '导出设置',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              filters: [
                { name: 'JSON Files', extensions: ['json'] }
              ],
              defaultPath: 'xpaste-settings.json'
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('menu-export-settings', result.filePath);
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectall' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: '切换开发者工具', accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 xPaste',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 xPaste',
              message: 'xPaste',
              detail: '跨设备剪贴板同步工具\n版本: 0.1.0\n\n© 2024 xPaste Team'
            });
          }
        },
        {
          label: '学习更多',
          click: () => {
            shell.openExternal('https://github.com/xpaste/xpaste');
          }
        }
      ]
    }
  ];

  // macOS菜单调整
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: '关于 ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: '隐藏 ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: '隐藏其他', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    });

    // 窗口菜单
    template[4].submenu = [
      { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
      { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      { type: 'separator' },
      { label: '前置所有窗口', role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC 处理程序
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('is-development', () => {
  return isDev;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('open-settings-window', () => {
  if (mainWindow) {
    // 避免 macOS 的还原动画
    if (mainWindow.isMinimized()) {
      if (process.platform !== 'darwin') {
        mainWindow.restore();
      } else {
        try { mainWindow.hide(); } catch (_) {}
      }
    }
    mainWindow.show();
    mainWindow.focus();
    // 切换到设置标签页
    mainWindow.webContents.send('switch-to-tab', 'settings');
  }
});

// 快捷键相关 IPC
ipcMain.handle('update-hotkeys', (event, hotkeys) => {
  try {
    const accelerator = hotkeys?.show_window;
    return registerShowWindowHotkey(accelerator);
  } catch (err) {
    return { success: false, error: err?.message || '更新快捷键失败' };
  }
});

// 更新关闭行为设置
ipcMain.handle('update-close-behavior', (event, behavior) => {
  try {
    const action = behavior?.close_action;
    if (!['minimize', 'hide', 'quit'].includes(action)) {
      throw new Error('无效的关闭行为');
    }
    userCloseBehavior = action;
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || '更新关闭行为失败' };
  }
});

ipcMain.handle('show-main-window', () => {
  try {
    showMainWindow();
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || '显示主窗口失败' };
  }
});

// 窗口控制 IPC 处理器
ipcMain.handle('minimize-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    // 在 macOS 上避免“最小化→还原”的系统动画，改为隐藏
    if (process.platform === 'darwin') {
      try { window.hide(); } catch (_) {}
      try { app.dock.hide(); } catch (_) {}
    } else {
      window.minimize();
    }
  }
});

ipcMain.handle('maximize-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.handle('unmaximize-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.unmaximize();
  }
});

ipcMain.handle('is-window-maximized', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? window.isMaximized() : false;
});

ipcMain.handle('close-current-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
});

ipcMain.handle('fs-read-text', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err?.message || 'read failed' };
  }
});

ipcMain.handle('fs-write-text', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'write failed' };
  }
});

ipcMain.handle('fs-append-text', async (event, filePath, content) => {
  try {
    fs.appendFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'append failed' };
  }
});

ipcMain.handle('fs-ensure-dir', async (event, dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'mkdir failed' };
  }
});

ipcMain.handle('fs-list', async (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map((d) => ({
      name: d.name,
      path: path.join(dirPath, d.name),
      isDirectory: d.isDirectory(),
      isFile: d.isFile(),
    }));
    return { success: true, data: entries };
  } catch (err) {
    return { success: false, error: err?.message || 'list failed' };
  }
});

ipcMain.handle('fs-delete', async (event, targetPath) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'delete failed' };
  }
});

ipcMain.handle('fs-rename', async (event, fromPath, toPath) => {
  try {
    fs.renameSync(fromPath, toPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'rename failed' };
  }
});

ipcMain.handle('fs-save-base64', async (event, filePath, base64DataUrl) => {
  try {
    try { fs.mkdirSync(path.dirname(filePath), { recursive: true }) } catch {}
    let data = base64DataUrl;
    const idx = typeof data === 'string' ? data.indexOf(',') : -1;
    if (idx >= 0) {
      data = data.slice(idx + 1);
    }
    if (typeof data === 'string') {
      data = data.replace(/\s+/g, '');
    }
    const buf = Buffer.from(data, 'base64');
    console.log('[fs-save-base64] writing', filePath, 'bytes:', buf.length);
    fs.writeFileSync(filePath, buf);
    const ok = fs.existsSync(filePath);
    if (!ok) return { success: false, error: 'file-not-exists-after-save' };
    console.log('[fs-save-base64] saved ok:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[fs-save-base64] error:', err);
    return { success: false, error: err?.message || 'save failed' };
  }
});

ipcMain.handle('fs-save-bytes', async (event, filePath, bytes) => {
  try {
    try { fs.mkdirSync(path.dirname(filePath), { recursive: true }) } catch {}
    const buf = Buffer.from(bytes);
    console.log('[fs-save-bytes] writing', filePath, 'bytes:', buf.length);
    fs.writeFileSync(filePath, buf);
    const ok = fs.existsSync(filePath);
    if (!ok) return { success: false, error: 'file-not-exists-after-save' };
    console.log('[fs-save-bytes] saved ok:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[fs-save-bytes] error:', err);
    return { success: false, error: err?.message || 'save failed' };
  }
});

ipcMain.handle('fs-read-bytes', async (event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    return { success: true, data: buf };
  } catch (err) {
    return { success: false, error: err?.message || 'read failed' };
  }
});

ipcMain.handle('fs-read-dataurl', async (event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = (path.extname(filePath) || '.png').toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : 'application/octet-stream';
    const b64 = buf.toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;
    return { success: true, data: dataUrl };
  } catch (err) {
    return { success: false, error: err?.message || 'read failed' };
  }
});

ipcMain.handle('fs-exists', async (event, targetPath) => {
  try {
    const ok = fs.existsSync(targetPath);
    return { success: true, data: ok };
  } catch (err) {
    return { success: false, error: err?.message || 'exists failed' };
  }
});

// 处理应用程序协议（用于深度链接）
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('xpaste', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('xpaste');
}

// 处理深度链接
app.on('open-url', (event, url) => {
  event.preventDefault();
  // 处理 xpaste:// 协议链接
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
  }
});

// Windows/Linux 深度链接处理
app.on('second-instance', (event, commandLine, workingDirectory) => {
  // 有人试图运行第二个实例，我们应该聚焦到我们的窗口
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    
    // 处理命令行参数中的深度链接
    const url = commandLine.find(arg => arg.startsWith('xpaste://'));
    if (url) {
      mainWindow.webContents.send('deep-link', url);
    }
  }
});

// 确保只有一个应用实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时，将会聚焦到myWindow这个窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 退出前注销所有快捷键
app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
    console.log('已注销所有全局快捷键');
  } catch (err) {
    console.warn('注销快捷键时出现问题:', err);
  }
});
