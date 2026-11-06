import { useRef, useState } from "react";
import { Bell, FileUp } from "lucide-react";
import { ContractCard } from "@/components/contract-card";
import { ProgressBar } from "@/components/progress-bar";
import type { Contract } from "@/lib/contracts";
import type { RemindState } from "@/lib/native";
import { warmOcr } from "@/lib/ocr";
import type { useUpload } from "@/lib/use-upload";

type Props = {
  due: Contract[];
  today: string;
  remind: RemindState | null;
  upload: ReturnType<typeof useUpload>;
  onOrganize: (text: string) => string;
  onAskPermission: () => void;
  onEdit: (row: Contract) => void;
  onDelete: (row: Contract) => void;
  onAck: (row: Contract) => void;
};

export function HomePage({ due, today, remind, upload, onOrganize, onAskPermission, onEdit, onDelete, onAck }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const busy = upload.job !== null;

  function organize() {
    const message = onOrganize(text);
    setError(message);
    if (!message) setText("");
  }

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 font-serif text-3xl font-semibold tracking-tight text-ink">提醒</h1>
        <div className="shrink-0 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-center text-primary-fg">
          <p className="text-xs opacity-80">待提醒</p>
          <p className="font-serif text-2xl leading-tight">{due.length}</p>
        </div>
      </header>

      <section className="mt-5 rounded-lg border border-line bg-surface p-4 shadow-sm">
        <textarea
          aria-label="合同信息"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="例如：客户星河科技，年度维保合同，2025年11月5日签订，2026年12月5日到期"
          className="w-full resize-none rounded-md border border-line bg-bg px-3 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-primary"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              warmOcr();
              fileRef.current?.click();
            }}
            className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-fg disabled:opacity-60"
          >
            <FileUp className="size-4" />
            上传合同
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={organize}
            className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-md border border-primary px-3 text-sm font-medium text-primary disabled:opacity-60"
          >
            整理并录入
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(event) => {
            void upload.start(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {upload.job && <ProgressBar {...upload.job} onCancel={upload.cancel} />}
        {upload.note && <p className="mt-3 text-sm leading-6 text-danger">{upload.note}</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>

      {remind === "denied" && (
        <button
          type="button"
          onClick={onAskPermission}
          className="mt-4 flex w-full items-center gap-3 rounded-lg border border-warn bg-warn-bg px-4 py-3 text-left text-sm"
        >
          <Bell className="size-4 shrink-0 text-warn" />
          <span>还没有通知权限，到期提醒不会弹出。点此开启；若没有弹窗，请到手机 设置 → 通知 → 提醒 里打开。</span>
        </button>
      )}
      {remind === "error" && (
        <p className="mt-4 rounded-lg border border-warn bg-warn-bg px-4 py-3 text-sm text-warn">提醒没能设置成功，请重新打开应用再试。</p>
      )}

      <section className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl text-ink">提醒中</h2>
          {due.length > 3 && <p className="text-xs text-muted">共 {due.length} 份，上下滑动查看</p>}
        </div>
        {due.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-5 text-sm text-muted">暂无</p>
        ) : (
          // 按到期先后排好，最快到期的在最上面；框高约三张卡片，超出的在框内上下滑动
          <ul className="scroll-y mt-3 flex max-h-[32rem] flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
            {due.map((row) => (
              <li key={row.id}>
                <ContractCard row={row} today={today} onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} onAck={() => onAck(row)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
