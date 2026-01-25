import React, { useCallback, useEffect, useState } from 'react';
import { memoryAutoUpgradeService, type MemoryAutoUpgradeConfig } from '../../src/services/context/memoryAutoUpgrade';

interface AutoUpgradeSettingsSectionProps {
  currentUiLang: 'zh' | 'en';
}

export const AutoUpgradeSettingsSection: React.FC<AutoUpgradeSettingsSectionProps> = ({ currentUiLang }) => {
  const [config, setConfig] = useState<MemoryAutoUpgradeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const t = currentUiLang === 'zh' ? {
    upgradeThreshold: '升级阈值（天数）',
    upgradeThresholdDesc: '中期记忆多少天未访问后升级为长期记忆',
    minAccessCount: '最小访问次数',
    minAccessCountDesc: '至少被访问多少次才会考虑升级',
    enableAutoUpgrade: '启用自动升级',
    enableAutoUpgradeDesc: '自动将符合条件的中期记忆升级为长期记忆',
    days: '天',
    times: '次',
    loading: '加载中...',
  } : {
    upgradeThreshold: 'Upgrade Threshold (Days)',
    upgradeThresholdDesc: 'Days of no access before upgrading mid-term to long-term memory',
    minAccessCount: 'Min Access Count',
    minAccessCountDesc: 'Minimum access count before considering upgrade',
    enableAutoUpgrade: 'Enable Auto Upgrade',
    enableAutoUpgradeDesc: 'Automatically upgrade eligible mid-term memories to long-term',
    days: 'days',
    times: 'times',
    loading: 'Loading...',
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await memoryAutoUpgradeService.getConfig();
        setConfig(cfg);
      } catch (error) {
        console.error('[AutoUpgradeSettingsSection] Failed to load config:', error);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const updateConfig = useCallback(async (updates: Partial<MemoryAutoUpgradeConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await memoryAutoUpgradeService.updateConfig(newConfig);
    } catch (error) {
      console.error('[AutoUpgradeSettingsSection] Failed to update config:', error);
    }
  }, [config]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-[rgb(var(--text-secondary))]">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[rgb(var(--text-primary))]">{t.enableAutoUpgrade}</div>
          <div className="text-xs text-[rgb(var(--text-secondary))]">{t.enableAutoUpgradeDesc}</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            onChange={(e) => updateConfig({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[rgb(var(--neutral-300))] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[rgba(var(--primary-500)/0.3)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[rgb(var(--border-main))] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[rgb(var(--primary-500))]"></div>
        </label>
      </div>

      {/* Upgrade Threshold */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
          {t.upgradeThreshold}
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="7"
            max="90"
            step="1"
            value={config?.daysThreshold || 30}
            onChange={(e) => updateConfig({ daysThreshold: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-[rgb(var(--primary-500))]"
          />
          <span className="text-sm font-medium text-[rgb(var(--primary-500))] min-w-[3ch]">
            {config?.daysThreshold || 30}
          </span>
          <span className="text-xs text-[rgb(var(--text-secondary))]">{t.days}</span>
        </div>
        <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">{t.upgradeThresholdDesc}</p>
      </div>

      {/* Min Access Count */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
          {t.minAccessCount}
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={config?.minAccessCount || 3}
            onChange={(e) => updateConfig({ minAccessCount: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-[rgb(var(--bg-element))] rounded-lg appearance-none cursor-pointer accent-[rgb(var(--primary-500))]"
          />
          <span className="text-sm font-medium text-[rgb(var(--primary-500))] min-w-[2ch]">
            {config?.minAccessCount || 3}
          </span>
          <span className="text-xs text-[rgb(var(--text-secondary))]">{t.times}</span>
        </div>
        <p className="text-xs text-[rgb(var(--text-secondary))] mt-1">{t.minAccessCountDesc}</p>
      </div>
    </div>
  );
};
