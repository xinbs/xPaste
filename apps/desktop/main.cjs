const { app, BrowserWindow, Menu, shell, ipcMain, dialog, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

// 跨平台图标路径获取函数
function getWindowIcon() {
  const platform = process.platform;
  const assetsDir = path.join(__dirname, 'assets');
  
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
let settingsWindow;
let tray;

function createWindow() {
  // 创建浏览器窗口 - 设计为紧凑的长条形剪贴板工具
  mainWindow = new BrowserWindow({
    width: 400,           // 较窄的宽度，适合长条形设计
    height: 600,          // 较高的高度，便于显示历史记录列表
    minWidth: 320,        // 最小宽度限制，保证基本可用性
    minHeight: 400,       // 最小高度
    maxWidth: 800,        // 最大宽度限制，避免过宽
    resizable: true,      // 允许调整大小
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: getWindowIcon(),
    show: false,
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
    // 窗口位置优化
    x: undefined,
    y: undefined,
    // 窗口样式优化
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    // 性能优化
    backgroundThrottling: false,
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
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 如果是开发模式，聚焦到窗口
    if (isDev) {
      mainWindow.focus();
    }
  });

  // 监听窗口状态变化
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-unmaximized');
  });

  // 窗口关闭时隐藏到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      
      // 首次隐藏时显示提示
      if (tray && !tray.isDestroyed()) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'xPaste',
          content: '应用已最小化到系统托盘'
        });
      }
    }
  });

  // 当窗口关闭时触发
  mainWindow.on('closed', () => {
    // 取消引用window对象，如果你的应用支持多窗口，
    // 通常会把多个window对象存放在一个数组里，
    // 与此同时，你应该删除相应的元素。
    mainWindow = null;
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createSettingsWindow() {
  // 如果设置窗口已经存在，则聚焦到该窗口
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    parent: mainWindow,
    modal: false,
    show: false,
    title: 'xPaste 设置'
  });

  // 使用独立的设置窗口HTML文件，避免与主窗口强耦合
  const settingsUrl = `file://${path.join(__dirname, 'settings.html')}`;
  
  settingsWindow.loadURL(settingsUrl);

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    if (isDev) {
      settingsWindow.webContents.openDevTools();
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
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
          if (iconPath.includes('Template')) {
            img.setTemplateImage(true);
            trayIcon = img;
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
        createSettingsWindow();
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
  createWindow();
  createTray();

  // 在macOS上，当点击dock图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
            createSettingsWindow();
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
  createSettingsWindow();
});

// 窗口控制 IPC 处理器
ipcMain.handle('minimize-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.minimize();
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