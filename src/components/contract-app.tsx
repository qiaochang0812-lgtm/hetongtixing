import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  Download,
  Mic,
  ShieldCheck,
  Pencil,
  Upload,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  formatCN,
  isISODate,
  loadContracts,
  parseBackup,
  parseContractText,
  phaseOf,
  reminderLabel,
  saveContracts,
  todayISO,
  type Contract,
  type Draft,
  type Phase,
} from "@/lib/contracts";
import { Capacitor } from "@capacitor/core";
import { exportBackup, syncReminders, type RemindState } from "@/lib/native";
import { startNativeSpeech, stopNativeSpeech } from "@/lib/speech";

const EXAMPLES = [
  "客户星河科技，年度维保合同，2025年11月5日签订，2026年12月5日到期",
  "和南山咖啡签了租赁合同，今年3月1日生效，有效期两年，月租8000元",
  "甲方临港物流，采购合同，2026年1月15日签署，明年1月14日到期",
];

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

const PERMISSIONS = [
  { name: "通知", why: "到期前一个月、一周和到期当天弹出提醒。第一次保存合同时会询问。" },
  { name: "闹钟和提醒（精确定时）", why: "让提醒在早上 9 点准时弹出，而不是被系统延后。" },
  { name: "开机启动", why: "手机重启后自动恢复已设置的提醒，不然重启后提醒会丢。" },
  { name: "麦克风", why: "点「语音输入」时用来听你说合同信息，用到时才会询问。" },
  { name: "联网", why: "安卓应用默认声明的权限；本应用不联网上传数据，语音识别由系统自带服务完成。" },
];

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function newId(): string {
  return crypto.randomUUID();
}

export function ContractApp() {
  const [rows, setRows] = useState<Contract[]>([]);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechNote, setSpeechNote] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [source, setSource] = useState<"rules" | "manual" | null>(null);
  const [remind, setRemind] = useState<RemindState | null>(null);
  const askRef = useRef(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [storageWarn, setStorageWarn] = useState(false);
  const [backupNote, setBackupNote] = useState("");
  const [showPerms, setShowPerms] = useState(false);
  const recogRef = useRef<InstanceType<SpeechCtor> | null>(null);
  const baseRef = useRef("");
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRows(loadContracts());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) setStorageWarn(!saveContracts(rows));
  }, [rows, ready]);

  useEffect(() => {
    if (!ready) return;
    const ask = askRef.current;
    askRef.current = false;
    void syncReminders(rows, ask).then(setRemind);
  }, [rows, ready]);

  useEffect(() => {
    return () => {
      recogRef.current?.stop();
    };
  }, []);

  const today = todayISO();
  const grouped = useMemo(() => {
    const isDue = (row: Contract) => phaseOf(row, today) === "due" && !row.acknowledged;
    const due = rows.filter(isDue).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    // “全部合同”里不再重复显示上面已经出现的；已过期的沉到最后，最近过期的在前
    const rank = (row: Contract) => (phaseOf(row, today) === "expired" ? 1 : 0);
    const rest = rows
      .filter((row) => !isDue(row))
      .sort((a, b) => {
        const diff = rank(a) - rank(b);
        if (diff) return diff;
        return rank(a) ? b.expiresOn.localeCompare(a.expiresOn) : a.expiresOn.localeCompare(b.expiresOn);
      });
    return { due, rest };
  }, [rows, today]);

  function stopListening() {
    recogRef.current?.stop();
    void stopNativeSpeech();
    setListening(false);
  }

  async function startListening() {
    setError("");
    setSpeechNote("");
    if (Capacitor.isNativePlatform()) {
      baseRef.current = text.trim();
      const result = await startNativeSpeech(
        (spoken) => {
          if (!spoken) {
            setSpeechNote("没听到内容。请靠近一点再说一次，或点输入法键盘上的话筒。");
            return;
          }
          const base = baseRef.current;
          setText(base ? `${base} ${spoken}` : spoken);
        },
        () => setListening(false),
      );
      if (result.ok) {
        setListening(true);
      } else {
        setSpeechNote(result.reason);
        textRef.current?.focus();
      }
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) {
      setSpeechNote("这个手机的应用内不能直接语音。请点输入法键盘上的话筒图标说话，效果一样。");
      textRef.current?.focus();
      return;
    }
    setError("");
    setSpeechNote("");
    const recog = new Ctor();
    recog.lang = "zh-CN";
    recog.continuous = true;
    recog.interimResults = true;
    baseRef.current = text.trim();
    recog.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      const spoken = `${finalText}${interim}`.trim();
      const base = baseRef.current;
      setText(base ? `${base} ${spoken}` : spoken);
    };
    recog.onerror = (event) => {
      setListening(false);
      const code = event?.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setSpeechNote("没有麦克风权限。请在浏览器设置里允许，或直接打字。");
      } else if (code === "network") {
        setSpeechNote("语音识别需要联网，现在连不上。可以直接打字。");
      } else if (code === "aborted") {
        // 主动停止，不提示
      } else {
        setSpeechNote("没听清。可以再说一次，或直接打字。");
      }
    };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    try {
      recog.start();
      setListening(true);
    } catch {
      setSpeechNote("语音暂时开不了，请直接输入。");
    }
  }

  function organizeText() {
    const spoken = text.trim();
    if (!spoken) {
      setError("先说一句，或点下面的例句。");
      return;
    }
    setError("");
    stopListening();
    setDraft(parseContractText(spoken, today));
    setSource("rules");
    setEditingId(null);
  }

  function openEdit(row: Contract) {
    setEditingId(row.id);
    setSource("manual");
    setDraft({
      customer: row.customer,
      title: row.title,
      signedOn: row.signedOn,
      expiresOn: row.expiresOn,
      amount: row.amount,
      notes: row.notes,
      raw: row.raw,
    });
    setError("");
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.customer.trim()) {
      setError("还缺客户名称。");
      return;
    }
    if (!isISODate(draft.signedOn) || !isISODate(draft.expiresOn)) {
      setError("签订日期和到期日期都要填完整。");
      return;
    }
    if (draft.expiresOn < draft.signedOn) {
      setError("到期日不能早于签订日。");
      return;
    }
    const title = draft.title.trim() || `${draft.customer.trim()}合同`;
    if (editingId) {
      setRows((current) =>
        current.map((row) =>
          row.id === editingId
            ? {
                ...row,
                // 改了到期日，之前的“已阅”就作废，重新进入提醒
                acknowledged: row.expiresOn === draft.expiresOn ? row.acknowledged : false,
                customer: draft.customer.trim(),
                title,
                signedOn: draft.signedOn,
                expiresOn: draft.expiresOn,
                amount: draft.amount.trim(),
                notes: draft.notes.trim(),
                raw: draft.raw,
              }
            : row,
        ),
      );
    } else {
      const row: Contract = {
        id: newId(),
        customer: draft.customer.trim(),
        title,
        signedOn: draft.signedOn,
        expiresOn: draft.expiresOn,
        amount: draft.amount.trim(),
        notes: draft.notes.trim(),
        raw: draft.raw,
        acknowledged: false,
        createdAt: new Date().toISOString(),
      };
      askRef.current = true;
      setRows((current) => [row, ...current]);
      setText("");
    }
    setDraft(null);
    setEditingId(null);
    setError("");
  }

  function removeRow(row: Contract) {
    if (!window.confirm(`确定删除「${row.customer} · ${row.title}」吗？删除后无法恢复。`)) return;
    setRows((current) => current.filter((item) => item.id !== row.id));
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    const imported = parseBackup(await file.text());
    if (!imported) {
      setBackupNote("这个文件不是本应用的备份，没有导入。");
      return;
    }
    const known = new Set(rows.map((row) => row.id));
    const fresh = imported.filter((row) => !known.has(row.id));
    setRows((current) => [...fresh, ...current]);
    setBackupNote(`已导入 ${fresh.length} 份合同${imported.length > fresh.length ? `，${imported.length - fresh.length} 份已存在，已跳过` : ""}。`);
  }

  async function enableNotify() {
    setRemind(await syncReminders(rows, true));
  }

  async function doExport() {
    const note = await exportBackup(rows);
    if (note) setBackupNote(note);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-serif text-3xl font-semibold tracking-tight text-ink">提醒</p>
          <p className="mt-1 text-sm text-muted">说一句合同，自动整理。到期前一个月提醒你。</p>
        </div>
        <div className="rounded-md bg-primary px-3 py-2 text-right text-primary-fg">
          <p className="text-xs opacity-80">待提醒</p>
          <p className="font-serif text-2xl leading-none">{grouped.due.length}</p>
        </div>
      </header>

      <section className="mt-6 rounded-lg border border-line bg-surface p-4 shadow-sm sm:p-5">
        <textarea
          id="utterance"
          aria-label="合同信息"
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="例如：客户星河科技，年度维保合同，2025年11月5日签订，2026年12月5日到期"
          className="mt-2 w-full resize-none rounded-md border border-line bg-bg px-3 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-primary"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={listening ? stopListening : () => void startListening()}
            className="relative inline-flex h-12 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
          >
            {listening && <span className="listen-ring absolute inset-0 rounded-md border border-primary" />}
            {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
            {listening ? "停止" : "语音输入"}
          </button>
          <button
            type="button"
            onClick={organizeText}
            className="inline-flex h-12 items-center rounded-md border border-primary px-4 text-sm font-medium text-primary"
          >
            整理并录入
          </button>
        </div>
        {speechNote && <p className="mt-2 text-sm text-muted">{speechNote}</p>}
        {error && !draft && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-muted">可以这样说</p>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setText(example);
                setError("");
              }}
              className="rounded-md bg-chip px-3 py-2 text-left text-sm text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {remind === "denied" && (
        <button
          type="button"
          onClick={() => void enableNotify()}
          className="mt-4 flex w-full items-center gap-3 rounded-lg border border-warn bg-warn-bg px-4 py-3 text-left text-sm"
        >
          <Bell className="size-4 text-warn" />
          <span>还没有通知权限，到期提醒不会弹出。点此开启；若没有弹窗，请到手机 设置 → 通知 → 提醒 里打开。</span>
        </button>
      )}
      {remind === "error" && (
        <p className="mt-4 rounded-lg border border-warn bg-warn-bg px-4 py-3 text-sm text-warn">
          提醒没能设置成功，请重新打开应用再试。
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-serif text-xl text-ink">该提醒了</h2>
        <p className="mt-1 text-sm text-muted">到期日前一个月起会出现在这里。</p>
        {grouped.due.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-6 text-sm text-muted">
            现在没有进入提醒期的合同。
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {grouped.due.map((row) => (
              <li key={row.id}>
                <ContractCard
                  row={row}
                  today={today}
                  emphasized
                  onEdit={() => openEdit(row)}
                  onDelete={() => removeRow(row)}
                  onAck={() =>
                    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, acknowledged: true } : item)))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl text-ink">其他合同</h2>
        {!ready ? (
          <p className="mt-3 text-sm text-muted">正在读取…</p>
        ) : grouped.rest.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-8 text-sm leading-6 text-muted">
            {rows.length === 0
              ? "还没有合同。说完点「整理并录入」，确认日期后就会记在这台设备上。"
              : "没有其他合同了。"}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {grouped.rest.map((row) => (
              <li key={row.id}>
                <ContractCard
                  row={row}
                  today={today}
                  onEdit={() => openEdit(row)}
                  onDelete={() => removeRow(row)}
                  onAck={() =>
                    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, acknowledged: true } : item)))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {storageWarn && (
        <p className="mt-6 rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
          这台设备的浏览器没能保存数据（可能是无痕模式或空间已满），关闭页面后合同会丢失。请先点下面的「导出备份」。
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void doExport()}
          disabled={rows.length === 0}
          className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm disabled:opacity-50"
        >
          <Download className="size-4" />
          导出备份
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm"
        >
          <Upload className="size-4" />
          导入备份
        </button>
        <button
          type="button"
          onClick={() => setShowPerms(true)}
          className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm"
        >
          <ShieldCheck className="size-4" />
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
        {backupNote && <p className="w-full text-sm text-muted">{backupNote}</p>}
      </div>

      <p className="mt-4 text-xs leading-5 text-muted">
        合同只存在这台手机的应用里，卸载应用或清除数据会丢，建议隔一阵导出一次备份。每份合同会在到期前一个月、一周和到期当天早上 9 点用系统通知提醒，应用不用打开。
      </p>

      {showPerms && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-3 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="perms-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-4 shadow-lg sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="perms-title" className="font-serif text-xl">
                本应用用到的权限
              </h2>
              <button type="button" aria-label="关闭" onClick={() => setShowPerms(false)} className="rounded-md p-2 text-muted">
                <X className="size-5" />
              </button>
            </div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {PERMISSIONS.map((item) => (
                <li key={item.name} className="py-3">
                  <p className="font-medium text-ink">{item.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{item.why}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-muted">
              不读取通讯录、短信、位置、相册和文件，也不会上传任何合同数据；合同只保存在这部手机里。
            </p>
          </div>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-3 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-4 shadow-lg sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="draft-title" className="font-serif text-xl">
                  {editingId ? "修改合同" : "确认后录入"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {"已按语句整理，请核对日期。"}
                </p>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setDraft(null)} className="rounded-md p-2 text-muted">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <Field label="客户" value={draft.customer} onChange={(customer) => setDraft({ ...draft, customer })} />
              <Field label="合同名称" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="签订日期" type="date" value={draft.signedOn} onChange={(signedOn) => setDraft({ ...draft, signedOn })} />
                <Field label="到期日期" type="date" value={draft.expiresOn} onChange={(expiresOn) => setDraft({ ...draft, expiresOn })} />
              </div>
              <Field label="金额（可选）" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} />
              <label className="grid gap-1 text-sm">
                <span className="text-muted">备注（可选）</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  rows={2}
                  className="rounded-md border border-line bg-bg px-3 py-2 text-base text-ink outline-none focus:border-primary"
                />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={saveDraft} className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-fg">
                保存
              </button>
              <button type="button" onClick={() => setDraft(null)} className="inline-flex h-12 items-center justify-center rounded-md border border-line px-4 text-sm">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-line bg-bg px-3 text-base text-ink outline-none focus:border-primary"
      />
    </label>
  );
}

function ContractCard({
  row,
  today,
  emphasized = false,
  onEdit,
  onDelete,
  onAck,
}: {
  row: Contract;
  today: string;
  emphasized?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAck: () => void;
}) {
  const phase: Phase = phaseOf(row, today);
  const tone =
    phase === "expired"
      ? "border-danger bg-danger-bg"
      : phase === "due" && !row.acknowledged
        ? "border-warn bg-warn-bg"
        : "border-line bg-surface";
  const badge =
    phase === "expired" ? "text-danger" : phase === "due" && !row.acknowledged ? "text-warn" : "text-ok";

  return (
    <article className={`rounded-lg border px-4 py-3 ${tone} ${emphasized ? "shadow-sm" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{row.customer}</h3>
          <p className="text-sm text-muted">{row.title}</p>
        </div>
        <p className={`text-right text-sm font-medium ${badge}`}>{reminderLabel(row, today)}</p>
      </div>
      <p className="mt-2 text-sm text-ink">
        签订 {formatCN(row.signedOn)} · 到期 {formatCN(row.expiresOn)}
        {row.amount ? ` · ${row.amount}` : ""}
      </p>
      {row.notes && <p className="mt-1 text-sm text-muted">{row.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "due" && !row.acknowledged && (
          <button type="button" onClick={onAck} className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm">
            <Check className="size-4" />
            已阅
          </button>
        )}
        <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm">
          <Pencil className="size-4" />
          修改
        </button>
        <button type="button" onClick={onDelete} className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-surface px-3 text-sm text-danger">
          <Trash2 className="size-4" />
          删除
        </button>
      </div>
    </article>
  );
}
