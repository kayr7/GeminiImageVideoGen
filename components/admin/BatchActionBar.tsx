const BTN = 'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors';

export default function BatchActionBar({
  count,
  onActivate,
  onDeactivate,
  onSetQuotas,
  onSetTags,
  onResetPasswords,
  onClear,
}: {
  count: number;
  onActivate: () => void;
  onDeactivate: () => void;
  onSetQuotas: () => void;
  onSetTags: () => void;
  onResetPasswords: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 bg-blue-600 dark:bg-blue-700 text-white rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
      <span className="text-sm font-semibold">{count} selected</span>
      <div className="h-5 w-px bg-blue-400" />
      <button onClick={onActivate} className={`${BTN} bg-green-500 hover:bg-green-400`}>
        Activate
      </button>
      <button onClick={onDeactivate} className={`${BTN} bg-red-500 hover:bg-red-400`}>
        Deactivate
      </button>
      <button onClick={onSetQuotas} className={`${BTN} bg-blue-500 hover:bg-blue-400`}>
        Set Quotas
      </button>
      <button onClick={onSetTags} className={`${BTN} bg-purple-500 hover:bg-purple-400`}>
        Set Tags
      </button>
      <button onClick={onResetPasswords} className={`${BTN} bg-yellow-500 hover:bg-yellow-400 text-yellow-900`}>
        Reset Passwords
      </button>
      <div className="flex-1" />
      <button onClick={onClear} className={`${BTN} bg-white/20 hover:bg-white/30`}>
        Clear
      </button>
    </div>
  );
}
