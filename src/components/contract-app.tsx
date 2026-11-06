import { useCallback, useMemo, useState } from "react";
import { BottomNav, type Tab } from "@/components/bottom-nav";
import { DraftDialog } from "@/components/dialogs";
import { contractName, isISODate, parseBackup, parseContractText, phaseOf, todayISO, type Contract, type Draft } from "@/lib/contracts";
import { exportBackup } from "@/lib/native";
import { useContracts } from "@/lib/use-contracts";
import { useUpload } from "@/lib/use-upload";
import { AllPage } from "@/pages/all-page";
import { HomePage } from "@/pages/home-page";
import { SettingsPage } from "@/pages/settings-page";

export function ContractApp() {
  const { rows, ready, storageWarn, remind, add, patch, remove, merge, askPermission } = useContracts();
  const [tab, setTab] = useState<Tab>("home");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [backupNote, setBackupNote] = useState("");

  const openDraft = useCallback((next: Draft) => {
    setDraft(next);
    setEditingId(null);
    setError("");
  }, []);
  const upload = useUpload(openDraft);

  const today = todayISO();
  // 提醒中：一个月内到期且没点“已阅”的，最快到期的排最前
  const due = useMemo(
    () =>
      rows
        .filter((row) => phaseOf(row, today) === "due" && !row.acknowledged)
        .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.createdAt.localeCompare(b.createdAt)),
    [rows, today],
  );

  function organize(text: string): string {
    const input = text.trim();
    if (!input) return "先输入一句合同信息。";
    openDraft(parseContractText(input, today));
    return "";
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
    const fields = {
      customer: draft.customer.trim(),
      title: draft.title.trim(),
      signedOn: draft.signedOn,
      expiresOn: draft.expiresOn,
      amount: draft.amount.trim(),
      notes: draft.notes.trim(),
      raw: draft.raw,
    };
    if (!fields.customer && !fields.title) return setError("公司名称和合同类型至少填一个。");
    if (!isISODate(fields.signedOn) || !isISODate(fields.expiresOn)) return setError("签订日期和到期日期都要填完整。");
    if (fields.expiresOn < fields.signedOn) return setError("到期日不能早于签订日。");
    if (editingId) {
      // 改了到期日，之前的“已阅”就作废，重新进入提醒
      patch(editingId, (row) => ({ ...row, ...fields, acknowledged: row.expiresOn === fields.expiresOn ? row.acknowledged : false }));
    } else {
      add({ id: crypto.randomUUID(), ...fields, acknowledged: false, createdAt: new Date().toISOString() });
    }
    closeDraft();
  }

  function removeRow(row: Contract) {
    if (window.confirm(`确定删除「${contractName(row)}」吗？删除后无法恢复。`)) remove(row.id);
  }

  const ack = (row: Contract) => patch(row.id, (item) => ({ ...item, acknowledged: true }));

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

  return (
    <>
      <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
        {storageWarn && (
          <p className="mb-4 rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
            没能保存数据（可能是存储空间已满），退出后合同会丢失。请先到「设置」导出备份。
          </p>
        )}
        {tab === "home" && (
          <HomePage
            due={due}
            today={today}
            remind={remind}
            upload={upload}
            onOrganize={organize}
            onAskPermission={() => void askPermission()}
            onEdit={openEdit}
            onDelete={removeRow}
            onAck={ack}
          />
        )}
        {tab === "all" && <AllPage rows={rows} ready={ready} today={today} onEdit={openEdit} onDelete={removeRow} onAck={ack} />}
        {tab === "settings" && (
          <SettingsPage canExport={rows.length > 0} note={backupNote} onExport={() => void doExport()} onImport={(file) => void importBackup(file)} />
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} />
      {draft && <DraftDialog draft={draft} editing={editingId !== null} error={error} onChange={setDraft} onSave={saveDraft} onClose={closeDraft} />}
    </>
  );
}
