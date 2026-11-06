import { Check, Pencil, Trash2 } from "lucide-react";
import { formatCN, phaseOf, reminderLabel, type Contract, type Phase } from "@/lib/contracts";

const ACTION = "inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm";

export function ContractCard({
  row,
  today,
  onEdit,
  onDelete,
  onAck,
}: {
  row: Contract;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
  onAck: () => void;
}) {
  const phase: Phase = phaseOf(row, today);
  const urgent = phase === "due" && !row.acknowledged;
  const tone = phase === "expired" ? "border-danger bg-danger-bg" : urgent ? "border-warn bg-warn-bg" : "border-line bg-surface";
  const badge = phase === "expired" ? "text-danger" : urgent ? "text-warn" : "text-ok";

  return (
    <article className={`rounded-lg border px-4 py-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <h3 className="text-base font-semibold text-ink">{row.customer}</h3>
          <p className="text-sm text-muted">{row.title}</p>
        </div>
        <p className={`max-w-[45%] shrink-0 text-right text-sm font-medium ${badge}`}>{reminderLabel(row, today)}</p>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted">签订</dt>
        <dd className="text-ink">{formatCN(row.signedOn)}</dd>
        <dt className="text-muted">到期</dt>
        <dd className="text-ink">{formatCN(row.expiresOn)}</dd>
        {row.amount && (
          <>
            <dt className="text-muted">金额</dt>
            <dd className="text-ink">{row.amount}</dd>
          </>
        )}
      </dl>
      {row.notes && <p className="mt-2 text-sm leading-6 text-muted [overflow-wrap:anywhere]">{row.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {urgent && (
          <button type="button" onClick={onAck} className={ACTION}>
            <Check className="size-4" />
            已阅
          </button>
        )}
        <button type="button" onClick={onEdit} className={ACTION}>
          <Pencil className="size-4" />
          修改
        </button>
        <button type="button" onClick={onDelete} className={`${ACTION} text-danger`}>
          <Trash2 className="size-4" />
          删除
        </button>
      </div>
    </article>
  );
}
