'use client';

import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/context/AuthContext';
import type {
  AdminModelConfigResponse,
  AdminCategorySettings,
  ModelAvailability,
  ModelInfo,
  ModelQuotaConfig,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/HdMImageVideo';

type CategoryState = {
  enabled: Set<string>;
  defaultModel: string | null;
  quotas: Record<string, { daily: string; monthly: string }>;
};

type CategoryStateMap = Record<string, CategoryState>;

type Registry = Record<string, ModelInfo[]>;

type AvailabilityMap = Record<string, ModelAvailability>;

function normaliseQuotaInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export default function AdminPage() {
  const { token, user, initialising } = useAuth();
  const [registry, setRegistry] = useState<Registry>({});
  const [categoryState, setCategoryState] = useState<CategoryStateMap>({});
  const [effectiveConfig, setEffectiveConfig] = useState<AvailabilityMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const isAdmin = useMemo(() => user?.roles?.includes('admin') ?? false, [user]);

  useEffect(() => {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/admin/models`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load admin configuration');
        }

        const payload: AdminModelConfigResponse = await response.json();
        applyConfigurationPayload(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [token, isAdmin]);

  const applyConfigurationPayload = (payload: AdminModelConfigResponse) => {
    setRegistry(payload.data.registry);
    setEffectiveConfig(payload.data.effective);

    const nextState: CategoryStateMap = {};
    Object.entries(payload.data.registry).forEach(([category, models]) => {
      const settings = payload.data.settings?.[category] as AdminCategorySettings | undefined;
      const effective = payload.data.effective?.[category];

      const enabledFromSettings = settings?.enabled?.filter((id) => models.some((model) => model.id === id));
      const enabledModels =
        enabledFromSettings && enabledFromSettings.length > 0
          ? enabledFromSettings
          : effective?.enabled?.map((model) => model.id) ?? models.map((model) => model.id);

      const resolvedDefault =
        settings?.default ?? effective?.default ?? (enabledModels.length > 0 ? enabledModels[0] : null);

      const quotas: Record<string, { daily: string; monthly: string }> = {};
      models.forEach((model) => {
        const quotaSource = settings?.quotas?.[model.id] ?? effective?.quotas?.[model.id];
        quotas[model.id] = {
          daily:
            quotaSource && quotaSource.daily !== undefined && quotaSource.daily !== null
              ? String(quotaSource.daily)
              : '',
          monthly:
            quotaSource && quotaSource.monthly !== undefined && quotaSource.monthly !== null
              ? String(quotaSource.monthly)
              : '',
        };
      });

      nextState[category] = {
        enabled: new Set(enabledModels),
        defaultModel: resolvedDefault ?? null,
        quotas,
      };
    });

    setCategoryState(nextState);
  };

  const handleToggleModel = (category: string, modelId: string, enabled: boolean) => {
    setCategoryState((previous) => {
      const current = previous[category];
      if (!current) return previous;
      const nextEnabled = new Set(current.enabled);
      if (enabled) {
        nextEnabled.add(modelId);
      } else {
        nextEnabled.delete(modelId);
      }

      let nextDefault = current.defaultModel;
      if (nextDefault && !nextEnabled.has(nextDefault)) {
        nextDefault = nextEnabled.size > 0 ? Array.from(nextEnabled)[0] : null;
      }

      return {
        ...previous,
        [category]: {
          ...current,
          enabled: nextEnabled,
          defaultModel: nextDefault,
        },
      };
    });
  };

  const handleQuotaChange = (category: string, modelId: string, field: 'daily' | 'monthly', value: string) => {
    setCategoryState((previous) => {
      const current = previous[category];
      if (!current) return previous;
      const quotaEntry = current.quotas[modelId] ?? { daily: '', monthly: '' };
      const nextValue = normaliseQuotaInput(value);
      return {
        ...previous,
        [category]: {
          ...current,
          quotas: {
            ...current.quotas,
            [modelId]: {
              ...quotaEntry,
              [field]: nextValue,
            },
          },
        },
      };
    });
  };

  const handleDefaultChange = (category: string, modelId: string) => {
    setCategoryState((previous) => {
      const current = previous[category];
      if (!current) return previous;
      return {
        ...previous,
        [category]: {
          ...current,
          defaultModel: modelId,
        },
      };
    });
  };

  const handleSaveCategory = async (category: string) => {
    if (!token) return;
    const state = categoryState[category];
    if (!state) return;

    setSavingCategory(category);
    setError(null);
    setSuccessMessage(null);

    try {
      const enabledModels = Array.from(state.enabled);
      const quotasPayload: Record<string, ModelQuotaConfig> = {};

      Object.entries(state.quotas).forEach(([modelId, quota]) => {
        const entry: ModelQuotaConfig = {};
        if (quota.daily !== undefined && quota.daily !== '') {
          const value = Number(quota.daily);
          if (!Number.isNaN(value)) {
            entry.daily = value;
          }
        }
        if (quota.monthly !== undefined && quota.monthly !== '') {
          const value = Number(quota.monthly);
          if (!Number.isNaN(value)) {
            entry.monthly = value;
          }
        }
        if (Object.keys(entry).length > 0) {
          quotasPayload[modelId] = entry;
        }
      });

      const payload: AdminCategorySettings = {
        enabled: enabledModels,
        default: state.defaultModel,
      };

      if (Object.keys(quotasPayload).length > 0) {
        payload.quotas = quotasPayload;
      }

      const response = await fetch(`${API_URL}/api/admin/models/${category}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          (data && typeof data.detail === 'string' && data.detail) ||
          (data && typeof data.error === 'string' && data.error) ||
          'Failed to update configuration';
        throw new Error(message);
      }

      const updated: AdminModelConfigResponse = await response.json();
      applyConfigurationPayload(updated);
      setSuccessMessage(`Updated ${category} configuration`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setSavingCategory(null);
    }
  };

  if (initialising || loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Loading administration tools…</p>
        </div>
      </div>
    );
  }

  if (!token || !isAdmin) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-6">
          <h1 className="text-2xl font-semibold mb-2">Administrator access required</h1>
          <p className="text-sm">
            You need to sign in with an account that has administrator privileges to manage model availability and quotas.
          </p>
        </div>
      </div>
    );
  }

  const categories = Object.keys(registry);

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Model configuration</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Enable or disable models and optionally define daily or monthly quotas. These settings take effect immediately for all users.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          <p>{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
          <p>{successMessage}</p>
        </div>
      )}

      {categories.map((category) => {
        const models = registry[category] ?? [];
        const state = categoryState[category];
        const effective = effectiveConfig[category];
        const enabledIds = state ? Array.from(state.enabled) : [];
        const enabledModels = models.filter((model) => state?.enabled.has(model.id));

        return (
          <section key={category} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white capitalize">{category} models</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Currently active: {effective?.enabled?.length ?? 0} enabled / {effective?.disabled?.length ?? 0} disabled.
                </p>
                {effective?.default && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Active default: {effective.default}</p>
                )}
              </div>
              <Button
                onClick={() => handleSaveCategory(category)}
                disabled={savingCategory === category}
                variant="primary"
              >
                {savingCategory === category ? 'Saving…' : 'Save changes'}
              </Button>
            </div>

            <div className="space-y-4">
              {models.map((model) => {
                const isEnabled = state?.enabled.has(model.id) ?? false;
                const quotas = state?.quotas?.[model.id] ?? { daily: '', monthly: '' };
                return (
                  <div key={model.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/40">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">{model.name}</h3>
                        {model.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-300">{model.description}</p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ID: {model.id}</p>
                      </div>
                      <label className="inline-flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(event) => handleToggleModel(category, model.id, event.target.checked)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                        <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                      </label>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Daily quota</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={quotas.daily}
                          onChange={(event) => handleQuotaChange(category, model.id, 'daily', event.target.value)}
                          placeholder="Unlimited"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                          disabled={!isEnabled}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank for unlimited daily usage.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Monthly quota</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={quotas.monthly}
                          onChange={(event) => handleQuotaChange(category, model.id, 'monthly', event.target.value)}
                          placeholder="Unlimited"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                          disabled={!isEnabled}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank for unlimited monthly usage.</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Default model</label>
              <select
                value={state?.defaultModel ?? ''}
                onChange={(event) => handleDefaultChange(category, event.target.value)}
                className="w-full md:w-1/2 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                disabled={enabledIds.length === 0}
              >
                {enabledModels.length === 0 && <option value="">No models enabled</option>}
                {enabledModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                This model will be selected by default for users in this category.
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
