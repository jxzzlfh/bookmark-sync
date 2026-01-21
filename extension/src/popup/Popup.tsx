import { useEffect, useState } from 'react';

interface SyncStatus {
  isConnected: boolean;
  isAuthenticated: boolean;
  lastSync: number | null;
}

export function Popup() {
  const [status, setStatus] = useState<SyncStatus>({
    isConnected: false,
    isAuthenticated: false,
    lastSync: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [serverUrl, setServerUrl] = useState('https://syn.xue.ee');
  const [navSiteUrl, setNavSiteUrl] = useState('https://syn.xue.ee');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Login state
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchStatus();
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      if (result.settings?.serverUrl) {
        setServerUrl(result.settings.serverUrl);
      }
      if (result.settings?.navSiteUrl) {
        setNavSiteUrl(result.settings.navSiteUrl);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  async function saveSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      const current = result.settings || {};
      await chrome.storage.local.set({
        settings: { ...current, serverUrl, navSiteUrl }
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      
      // Notify background to reconnect with new URL
      await chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  async function fetchStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      setStatus(response);
    } catch (e) {
      console.error('Failed to get status:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
      await fetchStatus();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      setLoginError('请输入邮箱和密码');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LOGIN',
        data: { email, password }
      });

      if (response.success) {
        setShowLogin(false);
        setEmail('');
        setPassword('');
        await fetchStatus();
      } else {
        setLoginError(response.error || '登录失败');
      }
    } catch (e) {
      setLoginError('登录失败，请检查网络');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleRegister() {
    if (!email || !password) {
      setLoginError('请输入邮箱和密码');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REGISTER',
        data: { email, password }
      });

      if (response.success) {
        setShowLogin(false);
        setEmail('');
        setPassword('');
        await fetchStatus();
      } else {
        setLoginError(response.error || '注册失败');
      }
    } catch (e) {
      setLoginError('注册失败，请检查网络');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    await fetchStatus();
  }

  async function openNavSite() {
    await chrome.tabs.create({ url: navSiteUrl });
  }

  async function testConnection() {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // 解析 API URL
      let apiUrl = serverUrl.trim();
      if (apiUrl.startsWith('wss://')) {
        apiUrl = apiUrl.replace('wss://', 'https://');
      } else if (apiUrl.startsWith('ws://')) {
        apiUrl = apiUrl.replace('ws://', 'http://');
      }
      apiUrl = apiUrl.replace(/\/ws\/?$/, '');
      
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        setTestResult({ success: true, message: `连接成功！服务器时间: ${new Date(data.timestamp).toLocaleString()}` });
      } else {
        setTestResult({ success: false, message: `服务器响应异常: ${response.status}` });
      }
    } catch (e) {
      setTestResult({ success: false, message: `连接失败: ${e instanceof Error ? e.message : '未知错误'}` });
    } finally {
      setIsTesting(false);
    }
  }

  function formatLastSync(timestamp: number | null): string {
    if (!timestamp) return '从未同步';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    
    return new Date(timestamp).toLocaleDateString();
  }

  if (isLoading) {
    return (
      <div className="w-80 p-4 bg-white">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  // Login/Register Modal
  if (showLogin) {
    return (
      <div className="w-80 bg-white">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">登录 / 注册</span>
            <button
              onClick={() => setShowLogin(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {loginError}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-gray-500">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
            >
              {isLoggingIn ? '登录中...' : '登录'}
            </button>
            <button
              onClick={handleRegister}
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors"
            >
              {isLoggingIn ? '注册中...' : '注册新账号'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900">Bookmark Sync</span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="p-4 space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">连接状态</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium">
              {status.isConnected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>

        {/* Auth Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">登录状态</span>
          <span className="text-sm font-medium">
            {status.isAuthenticated ? '已登录' : '未登录'}
          </span>
        </div>

        {/* Last Sync */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">上次同步</span>
          <span className="text-sm font-medium">{formatLastSync(status.lastSync)}</span>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {!status.isAuthenticated ? (
            <button
              onClick={() => setShowLogin(true)}
              className="w-full py-2.5 px-4 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              登录同步
            </button>
          ) : (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full py-2.5 px-4 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  同步中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  立即同步
                </>
              )}
            </button>
          )}

          <button
            onClick={openNavSite}
            className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            打开导航网站
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-900">设置</h3>
          
          <div className="space-y-2">
            <label className="text-xs text-gray-500">API服务器地址</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://syn.xue.ee"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                onClick={testConnection}
                disabled={isTesting}
                className="px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                {isTesting ? '测试中...' : '测试'}
              </button>
            </div>
            {testResult && (
              <div className={`p-2 text-xs rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {testResult.message}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500">导航网站地址</label>
            <input
              type="text"
              value={navSiteUrl}
              onChange={(e) => setNavSiteUrl(e.target.value)}
              placeholder="https://syn.xue.ee"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={saveSettings}
            className="w-full py-2 px-4 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {settingsSaved ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已保存
              </>
            ) : (
              '保存设置'
            )}
          </button>

          {status.isAuthenticated && (
            <button
              onClick={handleLogout}
              className="w-full py-2 px-4 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              退出登录
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-xs text-gray-400 text-center">
          Bookmark Sync v1.0.0
        </p>
      </div>
    </div>
  );
}
