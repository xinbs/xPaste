// 创建一个简单的托盘图标
const fs = require('fs');
const path = require('path');

// 手动构建简单的 PNG 数据太复杂，我们使用 raw pixel data 写入 buffer
// 但为了生成有效 PNG 文件，我们需要 PNG header 和 chunk 结构。
// 既然不能依赖第三方库，我们还是用之前的 hex dump 方式，但这次我们确保它是正确的。
// 或者，更简单的方法：我们已经在 main.cjs 里看到 createFallbackTrayIcon 能够生成 buffer。
// 我们可以把那个逻辑拿出来，保存为文件吗？
// Electron 的 nativeImage 可以从 buffer 创建，然后 save 为 PNG。
// 但这是一个独立的脚本，没有 electron 环境。

// 让我们尝试用一个最小的 base64 PNG，这肯定是一个有效的 16x16 图标。
// 这是一个 16x16 的黑色空心圆圈的 base64 (近似)
// 或者我们可以直接用一个非常简单的 base64 字符串。

// 这是一个 16x16 的黑色矩形边框 PNG 的 Base64
const base64Icon = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADBJREFUOE9jZGBg+A+EfxgYCEvhPwh7Hz58+A8xjoGhgGHUwDAD3QwYtWDUgIEbDACxYw+/77p91wAAAABJRU5ErkJggg==';

const buffer = Buffer.from(base64Icon, 'base64');

// 写入 tray-iconTemplate.png
const iconPath = path.join(__dirname, 'assets', 'tray-iconTemplate.png');
fs.writeFileSync(iconPath, buffer);
console.log('Tray icon created at:', iconPath);

// 同时覆盖 tray-icon.png
const iconPath2 = path.join(__dirname, 'assets', 'tray-icon.png');
fs.writeFileSync(iconPath2, buffer);
console.log('Tray icon created at:', iconPath2);
