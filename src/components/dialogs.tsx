import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Draft } from "@/lib/contracts";

export const PERMISSIONS = [
  { name: "通知", why: "到期前一个月、一周和到期当天弹出提醒。第一次保存合同时会询问。" },
  { name: "闹钟和提醒（精确定时）", why: "让提醒在早上 9 点准时弹出，而不是被系统延后。" },
  { name: "开机启动", why: "手机重启后自动恢复已设置的提醒，不然重启后提醒会丢。" },
  { name: "联网", why: "安卓应用默认声明的权限；本应用不联网上传任何数据，合同文件只在手机本地读取。" },
];

function Sheet({ title, titleId, onClose, children, footer }: { title: string; titleId: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center sm:p-3" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-lg bg-surface shadow-lg sm:rounded-lg"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <h2 id={titleId} className="font-serif text-xl">
            {title}
          </h2>
          <button type="button" aria-label="关闭" onClick={onClose} className="-mr-2 rounded-md p-2 text-muted">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 sm:px-5">{children}</div>
        {footer && <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}

export function PermissionsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="本应用用到的权限" titleId="perms-title" onClose={onClose}>
      <ul className="divide-y divide-line text-sm">
        {PERMISSIONS.map((item) => (
          <li key={item.name} className="py-3">
            <p className="font-medium text-ink">{item.name}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{item.why}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-muted">
        不读取通讯录、短信、位置和相册；只在你点「上传合同」时读取你选的那一份文件或图片，也不会上传任何合同数据。
      </p>
    </Sheet>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 rounded-md border border-line bg-bg px-3 text-base text-ink outline-none focus:border-primary"
      />
    </label>
  );
}

export function DraftDialog({
  draft,
  editing,
  error,
  onChange,
  onSave,
  onClose,
}: {
  draft: Draft;
  editing: boolean;
  error: string;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title={editing ? "修改合同" : "确认后录入"}
      titleId="draft-title"
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onSave} className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-fg">
              保存
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-12 items-center justify-center rounded-md border border-line px-5 text-sm">
              取消
            </button>
          </div>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="客户" value={draft.customer} onChange={(customer) => onChange({ ...draft, customer })} />
        <Field label="合同名称" value={draft.title} onChange={(title) => onChange({ ...draft, title })} />
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="签订日期" type="date" value={draft.signedOn} onChange={(signedOn) => onChange({ ...draft, signedOn })} />
          <Field label="到期日期" type="date" value={draft.expiresOn} onChange={(expiresOn) => onChange({ ...draft, expiresOn })} />
        </div>
        <Field label="金额（可选）" value={draft.amount} onChange={(amount) => onChange({ ...draft, amount })} />
        <label className="grid gap-1 text-sm">
          <span className="text-muted">备注（可选）</span>
          <textarea
            value={draft.notes}
            onChange={(event) => onChange({ ...draft, notes: event.target.value })}
            rows={3}
            className="rounded-md border border-line bg-bg px-3 py-2 text-base text-ink outline-none focus:border-primary"
          />
        </label>
      </div>
    </Sheet>
  );
}
