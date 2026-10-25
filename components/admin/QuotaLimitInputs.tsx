import Input from '@/components/ui/Input';
import { GENERATION_TYPES, type GenerationType } from './shared';

const LABELS: Record<GenerationType, string> = {
  image: 'Image',
  video: 'Video',
  speech: 'Speech',
  text: 'Text',
};

/** Four numeric inputs (one per generation type) used by the create and batch-quota forms. */
export default function QuotaLimitInputs({
  limits,
  onChange,
  labelSuffix = '',
  className,
}: {
  limits: Record<GenerationType, string>;
  onChange: (type: GenerationType, value: string) => void;
  labelSuffix?: string;
  className: string;
}) {
  return (
    <div className={className}>
      {GENERATION_TYPES.map((type) => (
        <Input
          key={type}
          label={`${LABELS[type]}${labelSuffix}`}
          type="number"
          value={limits[type]}
          onChange={(e) => onChange(type, e.target.value)}
          min="0"
        />
      ))}
    </div>
  );
}

export const defaultLimitStrings = (): Record<GenerationType, string> => ({
  image: '100',
  video: '50',
  speech: '100',
  text: '200',
});
