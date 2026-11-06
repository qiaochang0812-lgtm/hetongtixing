import { useMemo, useRef, useState } from "react";
import { Bell, Download, FileUp, ShieldCheck, Upload } from "lucide-react";
import { ContractCard } from "@/components/contract-card";
import { DraftDialog, PermissionsDialog } from "@/components/dialogs";
import { ProgressBar } from "@/components/progress-bar";
import type { Progress } from "@/lib/async";
import { parseContractDocument } from "@/lib/contract-doc";
import { isISODate, parseBackup, parseContractText, phaseOf, todayISO, type Contract, type Draft } from "@/lib/contracts";
import { extractFileText } from "@/lib/file-text";
import { exportBackup } from "@/lib/native";
import { closeOcr, warmOcr } from "@/lib/ocr";
import { useContracts } from "@/lib/use-contracts";

const EXAMPLES = [
  "客户星河科技，年度维保合同，2025年11月5日签订，2026年12月5日到期",
  "和南山咖啡签了租赁合同，今年3月1日生效，有效期两年，月租8000元",
];

const SMALL_BUTTON = "inline-flex h-10 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line bg-surface px-2 text-sm";

type Job = { percent: number; label: string; startedAt: number };

export function ContractApp() {
  const { rows, ready, storageWarn, remind, add, patch, remove, merge, askPermission } = useContracts();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [backupNote, setBackupNote] = useState("");
  const [showPerms, setShowPerms] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const runRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const today = todayISO();
  const { due, rest } = useMemo(() => {
    const isDue = (row: Contract) => phaseOf(row, today) === "due" && !row.acknowledged;
    const rank = (row: Contract) => (phaseOf(row, today) === "expired" ? 1 : 0);
    return {
      due: rows.filter(isDue).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)),
      // 已过期的沉到最后，最近过期的在前；其余按到期先后
      rest: rows
        .filter((row) => !isDue(row))
        .sort((a, b) => rank(a) - rank(b) || (rank(a) ? b.expiresOn.localeCompare(a.expiresOn) : a.expiresOn.localeCompare(b.expiresOn))),
    };
  }, [rows, today]);

  function openUpload() {
    warmOcr();
    fileRef.current?.click();
  }

  async function uploadContract(file: File | undefined) {
    if (!file) return;
    const run = ++runRef.current;
    const live = () => runRef.current === run;
    setError("");
    setFileNote("");
    setJob({ percent: 2, label: "正在读取文件…", startedAt: Date.now() });
    const progress: Progress = (percent, label) => {
      if (!live()) return;
      setJob((current) => (current ? { ...current, percent: Math.max(current.percent, Math.min(99, percent)), label } : current));
    };
    try {
      const { draft: parsed, found } = parseContractDocument(await extractFileText(file, progress));
      if (!live()) return;
      if (found === 0) {
        setFileNote("读到了文字，但没找到日期、金额等信息，请手动录入。");
        return;
      }
      setDraft(parsed);
      setEditingId(null);
    } catch (err) {
      if (live()) setFileNote(err instanceof Error && err.message ? err.message : "这份合同没能读取，请换一份或手动录入。");
    } finally {
      if (live()) setJob(null);
    }
  }

  function cancelUpload() {
    runRef.current += 1;
    setJob(null);
    closeOcr();
  }

  function organizeText() {
    const input = text.trim();
    if (!input) {
      setError("先输入一句合同信息，或点下面的示例。");
      return;
    }
    setError("");
    setDraft(parseContractText(input, today));
    setEditingId(null);
  }

  function openEdit(row: Contract) {
    setEditingId(row.id);
    setError("");
    setDraft({ customer: row.customer, title: row.title, signedOn: row.signedOn, expiresOn: row.expiresOn, amount: row.amount, notes: row.notes, raw: row.raw });
  }

  function closeDraft() {
    setDraft(null);
    setEditingId(null);
    setError("");
  }

  function saveDraft() {
    if (!draft) return;
    const customer = draft.customer.trim();
    if (!customer) return setError("还缺客户名称。");
    if (!isISODate(draft.signedOn) || !isISODate(draft.expiresOn)) return setError("签订日期和到期日期都要填完整。");
    if (draft.expiresOn < draft.signedOn) return setError("到期日不能早于签订日。");
    const fields = {
      customer,
      title: draft.title.trim() || `${customer}合同`,
      signedOn: draft.signedOn,
      expiresOn: draft.expiresOn,
      amount: draft.amount.trim(),
      notes: draft.notes.trim(),
      raw: draft.raw,
    };
    if (editingId) {
      // 改了到期日，之前的“已阅”就作废，重新进入提醒
      patch(editingId, (row) => ({ ...row, ...fields, acknowledged: row.expiresOn === fields.expiresOn ? row.acknowledged : false }));
    } else {
      add({ id: crypto.randomUUID(), ...fields, acknowledged: false, createdAt: new Date().toISOString() });
      setText("");
    }
    closeDraft();
  }

  function removeRow(row: Contract) {
    if (window.confirm(`确定删除「${row.customer} · ${row.title}」吗？删除后无法恢复。`)) remove(row.id);
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    const imported = parseBackup(await file.text());
    if (!imported) return setBackupNote("这个文件不是本应用的备份，没有导入。");
    const { added, skipped } = merge(imported);
    setBackupNote(`已导入 ${added} 份合同${skipped ? `，${skipped} 份已存在，已跳过` : ""}。`);
  }

  async function doExport() {
    const note = await exportBackup(rows);
    if (note) setBackupNote(note);
  }

  const cards = (list: Contract[]) => (
    <ul className="mt-3 flex flex-col gap-3">
      {list.map((row) => (
        <li key={row.id}>
          <ContractCard
            row={row}
            today={today}
            onEdit={() => openEdit(row)}
            onDelete={() => removeRow(row)}
            onAck={() => patch(row.id, (item) => ({ ...item, acknowledged: true }))}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
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
            onClick={openUpload}
            disabled={job !== null}
            className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-fg disabled:opacity-60"
          >
            <FileUp className="size-4" />
            上传合同
          </button>
          <button
            type="button"
            onClick={organizeText}
            disabled={job !== null}
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
            void uploadContract(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {job && <ProgressBar percent={job.percent} label={job.label} startedAt={job.startedAt} onCancel={cancelUpload} />}
        {fileNote && <p className="mt-3 text-sm leading-6 text-danger">{fileNote}</p>}
        {error && !draft && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-3 flex flex-col gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setText(example);
                setError("");
              }}
              className="rounded-md bg-chip px-3 py-2 text-left text-xs leading-5 text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {remind === "denied" && (
        <button
          type="button"
          onClick={() => void askPermission()}
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
        <h2 className="font-serif text-xl text-ink">该提醒了</h2>
        {due.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-5 text-sm text-muted">暂无</p> : cards(due)}
      </section>

      <section className="mt-7">
        <h2 className="font-serif text-xl text-ink">其他合同</h2>
        {!ready ? (
          <p className="mt-3 text-sm text-muted">正在读取…</p>
        ) : rest.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-5 text-sm text-muted">暂无</p>
        ) : (
          cards(rest)
        )}
      </section>

      {storageWarn && (
        <p className="mt-6 rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
          没能保存数据（可能是存储空间已满），退出后合同会丢失。请先点下面的「导出备份」。
        </p>
      )}

      <div className="mt-8 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => void doExport()} disabled={rows.length === 0} className={`${SMALL_BUTTON} disabled:opacity-50`}>
          <Download className="size-4 shrink-0" />
          导出备份
        </button>
        <button type="button" onClick={() => importRef.current?.click()} className={SMALL_BUTTON}>
          <Upload className="size-4 shrink-0" />
          导入备份
        </button>
        <button type="button" onClick={() => setShowPerms(true)} className={SMALL_BUTTON}>
          <ShieldCheck className="size-4 shrink-0" />
          权限说明
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            void importBackup(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {backupNote && <p className="mt-3 text-sm text-muted">{backupNote}</p>}
      <p className="mt-4 text-xs leading-5 text-muted">合同只存在这部手机里，卸载应用或清除数据会丢，建议隔一阵导出一次备份。</p>

      {showPerms && <PermissionsDialog onClose={() => setShowPerms(false)} />}
      {draft && <DraftDialog draft={draft} editing={editingId !== null} error={error} onChange={setDraft} onSave={saveDraft} onClose={closeDraft} />}
    </main>
  );
}
