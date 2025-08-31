// 设置窗口独立JavaScript文件
// 避免与主窗口强耦合

class SettingsWindow {
  constructor() {
    this.init();
  }

  async init() {
    try {
      // 等待DOM加载完成
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.render());
      } else {
        this.render();
      }
    } catch (error) {
      console.error('设置窗口初始化失败:', error);
      this.showError('设置窗口初始化失败');
    }
  }

  render() {
    const loadingEl = document.getElementById('loading');
    const rootEl = document.getElementById('settings-root');
    
    try {
      // 隐藏加载提示
      loadingEl.style.display = 'none';
      rootEl.style.display = 'block';
      
      // 渲染设置界面
      rootEl.innerHTML = this.getSettingsHTML();
      
      // 绑定事件
      this.bindEvents();
      
      // 加载当前设置
      this.loadSettings();
    } catch (error) {
      console.error('渲染设置界面失败:', error);
      this.showError('渲染设置界面失败');
    }
  }

  getSettingsHTML() {
    return `
      <div class="settings-section">
        <h2>同步设置</h2>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="autoSync" />
            <span>自动同步剪贴板</span>
          </label>
          <p class="setting-desc">启用后将自动同步剪贴板内容到其他设备</p>
        </div>
        
        <div class="setting-item">
          <label>
            <input type="checkbox" id="syncImages" />
            <span>同步图片</span>
          </label>
          <p class="setting-desc">同步剪贴板中的图片内容</p>
        </div>
        
        <div class="setting-item">
          <label>
            <input type="checkbox" id="syncFiles" />
            <span>同步文件</span>
          </label>
          <p class="setting-desc">同步剪贴板中的文件内容</p>
        </div>
      </div>
      
      <div class="settings-section">
        <h2>安全设置</h2>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="encryptData" />
            <span>加密传输</span>
          </label>
          <p class="setting-desc">使用端到端加密保护数据传输</p>
        </div>
        
        <div class="setting-item">
          <label>
            <input type="number" id="historyLimit" min="10" max="1000" value="100" />
            <span>历史记录限制</span>
          </label>
          <p class="setting-desc">保留的历史记录数量</p>
        </div>
      </div>
      
      <div class="settings-section">
        <h2>通知设置</h2>
        <div class="setting-item">
          <label>
            <input type="checkbox" id="showNotifications" />
            <span>显示通知</span>
          </label>
          <p class="setting-desc">当有新的剪贴板内容时显示通知</p>
        </div>
      </div>
      
      <div class="settings-actions">
        <button id="saveSettings" class="btn-primary">保存设置</button>
        <button id="resetSettings" class="btn-secondary">重置为默认</button>
        <button id="closeWindow" class="btn-secondary">关闭</button>
      </div>
      
      <style>
        .settings-section {
          margin-bottom: 30px;
          padding: 25px;
          background: #fafafa;
          border-radius: 8px;
          border: 1px solid #e1e5e9;
          transition: all 0.2s ease;
        }
        
        .settings-section:hover {
          border-color: #3498db;
          box-shadow: 0 2px 8px rgba(52, 152, 219, 0.1);
        }
        
        .settings-section h2 {
          color: #2c3e50;
          margin-bottom: 20px;
          font-size: 18px;
          font-weight: 600;
          display: flex;
          align-items: center;
        }
        
        .settings-section h2::before {
          content: '';
          width: 4px;
          height: 20px;
          background: #3498db;
          margin-right: 12px;
          border-radius: 2px;
        }
        
        .setting-item {
          margin-bottom: 20px;
          padding: 15px;
          background: white;
          border-radius: 6px;
          border: 1px solid #e8ecef;
          transition: all 0.2s ease;
        }
        
        .setting-item:hover {
          border-color: #3498db;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .setting-item label {
          display: flex;
          align-items: center;
          cursor: pointer;
          font-weight: 500;
          color: #2c3e50;
        }
        
        .setting-item input[type="checkbox"] {
          margin-right: 12px;
          transform: scale(1.3);
          accent-color: #3498db;
        }
        
        .setting-item input[type="number"] {
          margin-right: 12px;
          padding: 8px 12px;
          border: 2px solid #e1e5e9;
          border-radius: 6px;
          width: 100px;
          font-size: 14px;
          transition: border-color 0.2s ease;
        }
        
        .setting-item input[type="number"]:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }
        
        .setting-desc {
          color: #7f8c8d;
          font-size: 13px;
          margin-top: 8px;
          margin-left: 35px;
          line-height: 1.4;
        }
        
        .settings-actions {
          margin-top: 40px;
          padding-top: 25px;
          border-top: 2px solid #ecf0f1;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        
        .btn-primary, .btn-secondary {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #3498db, #2980b9);
          color: white;
          box-shadow: 0 2px 4px rgba(52, 152, 219, 0.3);
        }
        
        .btn-primary:hover {
          background: linear-gradient(135deg, #2980b9, #21618c);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(52, 152, 219, 0.4);
        }
        
        .btn-secondary {
          background: #ecf0f1;
          color: #2c3e50;
          border: 2px solid #bdc3c7;
        }
        
        .btn-secondary:hover {
          background: #d5dbdb;
          border-color: #95a5a6;
          transform: translateY(-1px);
        }
        
        @media (max-width: 600px) {
          .settings-actions {
            flex-direction: column;
          }
          
          .btn-primary, .btn-secondary {
            width: 100%;
            justify-content: center;
          }
        }
      </style>
    `;
  }

  bindEvents() {
    // 保存设置
    document.getElementById('saveSettings')?.addEventListener('click', () => {
      this.saveSettings();
    });
    
    // 重置设置
    document.getElementById('resetSettings')?.addEventListener('click', () => {
      this.resetSettings();
    });
    
    // 关闭窗口
    document.getElementById('closeWindow')?.addEventListener('click', () => {
      this.closeWindow();
    });
  }

  loadSettings() {
    try {
      // 从localStorage加载设置
      const settings = JSON.parse(localStorage.getItem('xpaste-settings') || '{}');
      
      // 应用设置到界面
      Object.keys(settings).forEach(key => {
        const element = document.getElementById(key);
        if (element) {
          if (element.type === 'checkbox') {
            element.checked = settings[key];
          } else {
            element.value = settings[key];
          }
        }
      });
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  saveSettings() {
    try {
      const settings = {};
      
      // 收集所有设置
      const inputs = document.querySelectorAll('#settings-root input');
      inputs.forEach(input => {
        if (input.type === 'checkbox') {
          settings[input.id] = input.checked;
        } else {
          settings[input.id] = input.value;
        }
      });
      
      // 保存到localStorage
      localStorage.setItem('xpaste-settings', JSON.stringify(settings));
      
      // 显示保存成功提示
      this.showMessage('设置已保存', 'success');
      
      console.log('设置已保存:', settings);
    } catch (error) {
      console.error('保存设置失败:', error);
      this.showMessage('保存设置失败', 'error');
    }
  }

  resetSettings() {
    try {
      // 清除localStorage中的设置
      localStorage.removeItem('xpaste-settings');
      
      // 重新渲染界面
      this.render();
      
      this.showMessage('设置已重置为默认值', 'success');
    } catch (error) {
      console.error('重置设置失败:', error);
      this.showMessage('重置设置失败', 'error');
    }
  }

  closeWindow() {
    // 如果有electronAPI，使用它关闭窗口
    if (window.electronAPI && window.electronAPI.closeWindow) {
      window.electronAPI.closeWindow();
    } else {
      // 否则尝试关闭窗口
      window.close();
    }
  }

  showMessage(message, type = 'info') {
    // 创建临时消息提示
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 15px;
      border-radius: 5px;
      color: white;
      font-size: 14px;
      z-index: 1000;
      background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
    `;
    
    document.body.appendChild(messageEl);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 3000);
  }

  showError(message) {
    const rootEl = document.getElementById('settings-root');
    const loadingEl = document.getElementById('loading');
    
    loadingEl.style.display = 'none';
    rootEl.style.display = 'block';
    rootEl.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #e74c3c;">
        <h3>错误</h3>
        <p>${message}</p>
        <button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
          重新加载
        </button>
      </div>
    `;
  }
}

// 初始化设置窗口
new SettingsWindow();