interface Props {
  used: number;
  limit: number;
}

export default function TokenMeter({ used, limit }: Props) {
  const ratio = limit > 0 ? used / limit : 0;
  const over = used > limit;
  const color = over ? 'bg-red-500' : ratio > 0.8 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div data-testid="token-meter" className="space-y-1">
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
        <span>Input size (estimate)</span>
        <span className={over ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
          ~{used.toLocaleString()} / {limit.toLocaleString()} tokens
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
      >
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {over && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Your input is too long ({used.toLocaleString()} tokens, limit {limit.toLocaleString()}). Shorten it to send.
        </p>
      )}
    </div>
  );
}
