// 设备相关工具函数

/**
 * 生成浏览器指纹作为设备标识符
 * 基于浏览器特征生成相对稳定的设备ID
 */
export function generateDeviceFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // 获取基本信息
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  const platform = navigator.platform;
  const screenResolution = `${screen.width}x${screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Canvas指纹
  let canvasFingerprint = '';
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    canvasFingerprint = canvas.toDataURL();
  }
  
  // WebGL指纹
  let webglFingerprint = '';
  try {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        webglFingerprint = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {
    // WebGL不可用
  }
  
  // 组合所有特征
  const features = [
    userAgent,
    language,
    platform,
    screenResolution,
    timezone,
    canvasFingerprint.slice(-50), // 只取canvas指纹的后50个字符
    webglFingerprint
  ].join('|');
  
  // 生成哈希
  return hashString(features);
}

/**
 * 简单的字符串哈希函数
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(36);
}

/**
 * 获取或生成设备ID
 * 优先从localStorage获取，如果不存在则生成新的
 */
export function getOrCreateDeviceId(): string {
  const DEVICE_ID_KEY = 'xpaste_device_id';
  
  // 尝试从localStorage获取
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // 生成新的设备ID
    deviceId = generateDeviceFingerprint();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

/**
 * 清除设备ID（用于重置）
 */
export function clearDeviceId(): void {
  const DEVICE_ID_KEY = 'xpaste_device_id';
  localStorage.removeItem(DEVICE_ID_KEY);
}

/**
 * 获取设备平台信息
 */
export function getDevicePlatform(): string {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Windows')) {
    return 'windows';
  } else if (userAgent.includes('Mac')) {
    return 'macos';
  } else if (userAgent.includes('Linux')) {
    return 'linux';
  }
  
  return 'web';
}

/**
 * 获取设备名称
 */
export function getDeviceName(): string {
  const platform = getDevicePlatform();
  const hostname = window.location.hostname || 'localhost';
  return `${platform}-${hostname}`;
}