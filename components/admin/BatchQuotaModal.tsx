import { useState } from 'react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Modal from './Modal';
import QuotaLimitInputs, { defaultLimitStrings } from './QuotaLimitInputs';
import { buildQuotaSettings, type GenerationType, type QuotaSetting, type QuotaType } from './shared';

export default function BatchQuotaModal({
  selectedCount,
  loading,
  onApply,
  onCancel,
}: {
  selectedCount: number;
  loading: boolean;
  onApply: (quotas: Record<GenerationType, QuotaSetting>) => void;
  onCancel: () => void;
}) {
  const [quotaType, setQuotaType] = useState<QuotaType>('limited');
  const [limits, setLimits] = useState(defaultLimitStrings);

  return (
    <Modal
      title="Set Quotas"
      subtitle={`Apply to ${selectedCount} selected user(s). This replaces their current quotas.`}
    >
      <div className="space-y-4">
        <Select
          label="Quota Type"
          value={quotaType}
          onChange={(e) => setQuotaType(e.target.value as QuotaType)}
          options={[
            { value: 'limited', label: 'Limited' },
            { value: 'unlimited', label: 'Unlimited' },
          ]}
        />
        {quotaType !== 'unlimited' && (
          <QuotaLimitInputs
            className="grid grid-cols-2 gap-3"
            limits={limits}
            onChange={(type, value) => setLimits((prev) => ({ ...prev, [type]: value }))}
          />
        )}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => onApply(buildQuotaSettings(quotaType, limits))}
            isLoading={loading}
            disabled={loading}
          >
            Apply Quotas
          </Button>
          <Button onClick={onCancel} className="bg-gray-500 hover:bg-gray-600">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
