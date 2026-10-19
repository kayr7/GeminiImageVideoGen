import Input from '@/components/ui/Input';

/** Inputs for the {{variables}} detected in a template message. */
export default function VariableInputs({
  variables,
  values,
  onChange,
}: {
  variables: string[];
  values: Record<string, string>;
  onChange: (variable: string, value: string) => void;
}) {
  if (variables.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Template Variables:</h4>
      <div className="grid grid-cols-2 gap-3">
        {variables.map((variable) => (
          <div key={variable}>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{variable}:</label>
            <Input
              value={values[variable] || ''}
              onChange={(e) => onChange(variable, e.target.value)}
              placeholder={`Enter ${variable}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
