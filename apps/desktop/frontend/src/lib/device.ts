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
  } catch {
    // WebGL不可用
    void 0;
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

function generateRandomDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    hex += (v < 16 ? '0' : '') + v.toString(16);
  }
  return `dev-${hex}`;
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
    deviceId = generateRandomDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } else if (deviceId.length < 12) {
    deviceId = generateRandomDeviceId();
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

/**
 * 获取本机内网IP地址
 * 通过WebRTC获取本机真实IP地址
 */
export async function getLocalIPAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    // 创建RTCPeerConnection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // 创建数据通道
    pc.createDataChannel('');
    
    let bestIPv4: string | null = null;
    let ipv6Fallback: string | null = null;
    const allIPv4Candidates: string[] = [];
    
    // 监听ICE候选
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.candidate;
        console.log('[IP Detection] ICE candidate:', candidate);
        
        // 匹配IPv4地址
        const ipv4Match = candidate.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
        if (ipv4Match) {
          const ip = ipv4Match[1];
          console.log('[IP Detection] Found IPv4:', ip);
          
          // 收集所有IPv4地址
          if (!allIPv4Candidates.includes(ip)) {
            allIPv4Candidates.push(ip);
          }
          
          // 只收集IP，不立即返回，让所有候选都被收集
          if (isPrivateIPv4(ip) && ip !== '127.0.0.1') {
            console.log('[IP Detection] Found private IPv4:', ip);
            // 更新最佳IP选择逻辑
            if (!bestIPv4 || isPreferredIP(ip, bestIPv4)) {
              bestIPv4 = ip;
            }
          } else if (!bestIPv4 && ip !== '127.0.0.1') {
            // 如果没有内网IP，记录第一个非回环的IPv4地址
            bestIPv4 = ip;
          }
        }
        
        // 记录IPv6地址作为备选
        const ipv6Match = candidate.match(/([a-f0-9]{0,4}:+[a-f0-9:]+)/);
        if (ipv6Match) {
          const ip = ipv6Match[1];
          console.log('[IP Detection] Found IPv6:', ip);
          // 排除回环地址，但保留链路本地地址作为备选
          if (ip !== '::1' && (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd'))) {
            if (!ipv6Fallback) {
              ipv6Fallback = ip;
            }
          }
        }
      }
    };
    
    // 创建offer
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch((error) => {
        console.error('[IP Detection] Failed to create offer:', error);
        resolve(bestIPv4 || ipv6Fallback);
      });
    
    // 超时处理 - 收集完所有IP后选择最佳的
    setTimeout(() => {
      pc.close();
      console.log('[IP Detection] Timeout reached. All IPv4 candidates:', allIPv4Candidates);
      console.log('[IP Detection] Best IPv4:', bestIPv4);
      console.log('[IP Detection] IPv6 fallback:', ipv6Fallback);
      
      // 优先返回最佳IPv4地址，如果没有则返回IPv6备选
      resolve(bestIPv4 || ipv6Fallback);
    }, 5000); // 增加超时时间到5秒
  });
}

/**
 * 判断是否为虚拟网卡IP（常见的虚拟化软件网段）
 */
function isVirtualNetworkIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  // VMware 常用网段
  if (parts[0] === 192 && parts[1] === 168) {
    // VMware Workstation 默认网段
    if (parts[2] >= 100 && parts[2] <= 200) return true;
    // VirtualBox 默认网段
    if (parts[2] === 56) return true;
  }
  
  // Docker 网段
  if (parts[0] === 172 && parts[1] >= 17 && parts[1] <= 31) {
    return true;
  }
  
  return false;
}

/**
 * 获取IP地址的优先级分数
 * 分数越高优先级越高
 */
function getIPPriority(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return 0;
  
  // 192.168.x.x 网段
  if (parts[0] === 192 && parts[1] === 168) {
    // 虚拟网卡IP优先级较低
    if (isVirtualNetworkIP(ip)) {
      return 800 + parts[2]; // 虚拟网卡基础分800
    }
    // 真实物理网卡IP优先级最高
    return 2000 + parts[2]; // 物理网卡基础分2000
  }
  
  // 10.x.x.x 网段次优先级
  if (parts[0] === 10) {
    return 1500 + parts[1];
  }
  
  // 172.16-31.x.x 网段
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    // 检查是否为Docker等虚拟网络
    if (isVirtualNetworkIP(ip)) {
      return 300 + parts[1];
    }
    return 1000 + parts[1];
  }
  
  // 169.254.x.x (链路本地地址) 优先级较低
  if (parts[0] === 169 && parts[1] === 254) {
    return 100;
  }
  
  // 其他私有IP
  if (isPrivateIPv4(ip)) {
    return 50;
  }
  
  // 公网IP优先级最低
  return 10;
}

/**
 * 判断IP是否更优先（用于选择最佳IP）
 */
function isPreferredIP(newIP: string, currentBestIP: string): boolean {
  const newPriority = getIPPriority(newIP);
  const currentPriority = getIPPriority(currentBestIP);
  
  console.log(`[IP Detection] Comparing IPs: ${newIP} (priority: ${newPriority}) vs ${currentBestIP} (priority: ${currentPriority})`);
  
  return newPriority > currentPriority;
}

/**
 * 判断是否为IPv4私有IP地址
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 169.254.0.0/16 (链路本地地址)
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}
