import { useEffect, useState } from 'react';

interface Settings {
  serverUrl: string;
  syncEnabled: boolean;
}

export function Options() {
  const [settings, setSettings] = useState<Settings>({
    serverUrl: 'ws://localhost:3000/ws',
    syncEnabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const result = await chrome.storage.local.get('settings');
    if (result.settings) {
      setSettings(result.settings);
    }
  }

  async function saveSettings() {
    setIsSaving(true);
    try {
      await chrome.storage.local.set({ settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bookmark Sync</h1>
            <p className="text-sm text-gray-500">扩展设置</p>
          </div>
        </div>

        {/* Settings Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 space-y-6">
            {/* Server URL */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                同步服务器地址
              </label>
              <input
                type="text"
                value={settings.serverUrl}
                onChange={(e) => setSettings({ ...settings, serverUrl: e.target.value })}
                placeholder="ws://localhost:3000/ws"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500">
                WebSocket 服务器地址，用于实时同步书签
              </p>
            </div>

            {/* Sync Enabled */}
            <div className="flex items-center justify-between py-4 border-t border-gray-100">
              <div>
                <h3 className="text-sm font-medium text-gray-900">自动同步</h3>
                <p className="text-xs text-gray-500">书签变化时自动同步到云端</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.syncEnabled}
                  onChange={(e) => setSettings({ ...settings, syncEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                {saved && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    设置已保存
                  </span>
                )}
              </div>
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
              >
                {isSaving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <h3 className="text-sm font-medium text-blue-900 mb-2">使用说明</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>首次使用需要登录账号</li>
            <li>登录后书签会自动同步到云端</li>
            <li>可以通过导航网站查看和搜索所有书签</li>
            <li>支持多设备同步</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
