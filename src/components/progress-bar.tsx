import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function ProgressBar({
  percent,
  label,
  startedAt,
  onCancel,
}: {
  percent: number;
  label: string;
  startedAt: number;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [startedAt]);
  const value = Math.round(Math.min(100, Math.max(0, percent)));

  return (
    <div className="mt-3 rounded-md bg-chip px-3 py-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="min-w-0 flex-1 truncate text-ink">{label}</p>
        <p className="shrink-0 tabular-nums text-muted">
          {value}% · {seconds}秒
        </p>
        <button type="button" aria-label="取消" onClick={onCancel} className="-mr-1 shrink-0 rounded-md p-1 text-muted">
          <X className="size-4" />
        </button>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
