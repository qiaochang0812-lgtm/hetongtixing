import { splitName } from "@/lib/names";
export type Contract = {
  id: string;
  customer: string;
  title: string;
  signedOn: string;
  expiresOn: string;
  amount: string;
  notes: string;
  raw: string;
  acknowledged: boolean;
  createdAt: string;
};

export type Draft = {
  customer: string;
  title: string;
  signedOn: string;
  expiresOn: string;
  amount: string;
  notes: string;
  raw: string;
};

const KEY = "qiqi-contracts-v1";

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function formatCN(iso: string): string {
  if (!isISODate(iso)) return iso || "未填";
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

export function addMonths(iso: string, delta: number): string | null {
  if (!isISODate(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

export function dayDiff(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** 列表里显示的名称：优先公司名称，没有就用合同类型。 */
export function contractName(row: { customer: string; title: string }): string {
  return row.customer.trim() || row.title.trim() || "未命名合同";
}

export type Phase = "active" | "due" | "expired";

export function phaseOf(contract: Pick<Contract, "expiresOn">, today = todayISO()): Phase {
  if (!isISODate(contract.expiresOn)) return "active";
  if (dayDiff(today, contract.expiresOn) < 0) return "expired";
  const start = addMonths(contract.expiresOn, -1);
  if (start && dayDiff(today, start) <= 0) return "due";
  return "active";
}

export function reminderLabel(contract: Pick<Contract, "expiresOn" | "acknowledged">, today = todayISO()): string {
  const left = dayDiff(today, contract.expiresOn);
  const phase = phaseOf(contract, today);
  if (phase === "expired") return `已于 ${formatCN(contract.expiresOn)} 到期`;
  if (phase === "due") {
    if (left === 0) return "今天到期";
    return contract.acknowledged ? `已阅 · 还有 ${left} 天到期` : `提前提醒中 · 还有 ${left} 天`;
  }
  const start = addMonths(contract.expiresOn, -1);
  return start ? `${formatCN(start)} 起提醒 · 还有 ${left} 天` : `还有 ${left} 天`;
}

function isContract(value: unknown): value is Contract {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Contract>;
  return (
    typeof row.id === "string" &&
    typeof row.customer === "string" &&
    typeof row.title === "string" &&
    typeof row.signedOn === "string" &&
    typeof row.expiresOn === "string" &&
    typeof row.acknowledged === "boolean"
  );
}

export function normalizeContracts(parsed: unknown): Contract[] {
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed.filter(isContract).reduce<Contract[]>((list, row) => {
    if (seen.has(row.id)) return list;
    seen.add(row.id);
    list.push({
      ...row,
      amount: row.amount ?? "",
      notes: row.notes ?? "",
      raw: row.raw ?? "",
      createdAt: row.createdAt ?? new Date().toISOString(),
    });
    return list;
  }, []);
}

export function loadContracts(): Contract[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return normalizeContracts(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 返回 false 表示没存上（隐私模式、空间满等），界面要提示，不能静默丢数据。 */
export function saveContracts(rows: Contract[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

export function parseBackup(text: string): Contract[] | null {
  try {
    const value: unknown = JSON.parse(text);
    const list = Array.isArray(value) ? value : (value as { contracts?: unknown })?.contracts;
    const rows = normalizeContracts(list);
    return rows.length > 0 || (Array.isArray(list) && list.length === 0) ? rows : null;
  } catch {
    return null;
  }
}

export function emptyDraft(raw = ""): Draft {
  return {
    customer: "",
    title: "",
    signedOn: "",
    expiresOn: "",
    amount: "",
    notes: "",
    raw,
  };
}

type DateHit = { iso: string; index: number; length: number };

function yearOf(token: string, todayYear: number): number {
  if (token === "今年") return todayYear;
  if (token === "明年") return todayYear + 1;
  if (token === "后年") return todayYear + 2;
  if (token === "去年") return todayYear - 1;
  return todayYear;
}

function pushDate(hits: DateHit[], y: number, m: number, d: number, index: number, length: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  if (hits.some((hit) => hit.index === index)) return;
  hits.push({ iso, index, length });
}

function findDates(text: string, today: string): DateHit[] {
  const todayYear = Number(today.slice(0, 4));
  const hits: DateHit[] = [];

  const abs = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g;
  for (const match of text.matchAll(abs)) {
    pushDate(hits, Number(match[1]), Number(match[2]), Number(match[3]), match.index ?? 0, match[0].length);
  }

  const slash = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g;
  for (const match of text.matchAll(slash)) {
    pushDate(hits, Number(match[1]), Number(match[2]), Number(match[3]), match.index ?? 0, match[0].length);
  }

  const rel = /(今年|明年|后年|去年)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g;
  for (const match of text.matchAll(rel)) {
    pushDate(hits, yearOf(match[1], todayYear), Number(match[2]), Number(match[3]), match.index ?? 0, match[0].length);
  }

  const noYear = /(?<![\d年])(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g;
  for (const match of text.matchAll(noYear)) {
    const index = match.index ?? 0;
    if (hits.some((hit) => index >= hit.index && index < hit.index + hit.length)) continue;
    let y = todayYear;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const iso = `${y}-${pad(month)}-${pad(day)}`;
    if (isISODate(iso) && iso < today) y += 1;
    pushDate(hits, y, month, day, index, match[0].length);
  }

  return hits.sort((a, b) => a.index - b.index);
}

const EXPIRE_WORDS = /到期|届满|截止|失效|期满|结束|止/;
const SIGN_WORDS = /签订|签署|签约|签字|生效|起始|开始|签于|签的|起/;

function roleFor(text: string, hit: DateHit): "signed" | "expires" | "unknown" {
  // 只看日期紧挨着的同一个分句，避免“签订，一年后到期”把到期词算到签订日上
  const stop = /[，,。；;\n]/;
  const afterAll = text.slice(hit.index + hit.length);
  const afterClause = afterAll.split(stop)[0].slice(0, 8);
  const beforeAll = text.slice(0, hit.index);
  const beforeClause = beforeAll.split(stop).pop()!.slice(-8);

  const afterExp = afterClause.search(EXPIRE_WORDS);
  const afterSign = afterClause.search(SIGN_WORDS);
  if (afterExp >= 0 || afterSign >= 0) {
    if (afterExp >= 0 && (afterSign < 0 || afterExp < afterSign)) return "expires";
    return "signed";
  }
  const beforeExp = beforeClause.search(EXPIRE_WORDS);
  const beforeSign = beforeClause.search(SIGN_WORDS);
  if (beforeExp >= 0 || beforeSign >= 0) {
    // 前面的词离日期越近越准
    if (beforeExp > beforeSign) return "expires";
    return "signed";
  }
  return "unknown";
}

function cleanName(value: string): string {
  return value
    .replace(/[的了啊呢吧呀哦]$/g, "")
    .replace(/(签订|签署|签约|合同|到期|于|在).*$/g, "")
    .replace(/^[是为叫：:\s]+/, "")
    .trim();
}

function findCustomer(text: string): string {
  const patterns = [
    /(?:客户|甲方|对方)(?:名称|公司|名叫|叫做|是|为|叫)?\s*[:：]?\s*([A-Za-z0-9\u4e00-\u9fff·]{2,24})/,
    /和\s*([A-Za-z0-9\u4e00-\u9fff·]{2,20})\s*(?:签|公司|的)/,
    /给\s*([A-Za-z0-9\u4e00-\u9fff·]{2,20})\s*的/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const name = cleanName(match[1]);
    if (name.length >= 2 && !/合同|到期|签订/.test(name)) return name;
  }
  return "";
}

function findTitle(text: string): string {
  const quoted = text.match(/《([^》]{2,40})》/);
  if (quoted) return quoted[1];
  const named = text.match(/(?:合同名称|合同叫|合同是|这份是|签的是)\s*[:：]?\s*([^，,。；;\s]{2,24})/);
  if (named) {
    const title = named[1].replace(/合同$/, "");
    return title.endsWith("合同") ? title : `${title}`;
  }
  const kind = text.match(/(年度维保|维保|租赁|采购|服务|销售|劳务|框架|保密|代理|供货|施工)/);
  if (kind) return `${kind[1]}合同`;
  return "";
}

function findAmount(text: string): string {
  const wan = text.match(/(\d+(?:\.\d+)?)\s*万\s*元/);
  if (wan) return `${wan[1]}万元`;
  const yuan = text.match(/(\d+(?:\.\d+)?)\s*元/);
  if (yuan) return `${yuan[1]}元`;
  return "";
}

export function cnSmall(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return map[token] ?? null;
}

function durationShift(text: string): number | null {
  // 先去掉具体日期，避免把“2026年”当成“2026 年有效期”
  const body = text
    .replace(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, " ")
    .replace(/(?:今年|明年|后年|去年)\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, " ")
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/g, " ");
  const num = "(\\d+|[一两二三四五六七八九十])";
  const cue = "(?:有效期|为期|期限|一共|共|期)";
  if (/半年/.test(body)) return 6;

  const yearA = body.match(new RegExp(`${cue}\\s*${num}\\s*年`));
  const yearB = body.match(new RegExp(`${num}\\s*年\\s*(?:后|期|合同)`));
  const yearHit = yearA ?? yearB;
  if (yearHit) {
    const n = cnSmall(yearHit[1]);
    if (n && n <= 30) return n * 12;
  }
  const monthA = body.match(new RegExp(`${cue}\\s*${num}\\s*个?月`));
  const monthB = body.match(new RegExp(`${num}\\s*个?月\\s*(?:后|期|合同)`));
  const monthHit = monthA ?? monthB;
  if (monthHit) {
    const n = cnSmall(monthHit[1]);
    if (n && n <= 360) return n;
  }
  return null;
}

const LEAD_FILLER = /^(?:备注|说明|到期|届满|截止|生效|有效期|签订了?|签署了?|签约了?|签了|合同|另外|还有|并且|然后|就|和|跟|给|的|了|是|为|在|于|从|到|至|起|止)[:：]?/;
const TAIL_FILLER = /(?:的|了|起|止|生效|到期|届满|截止|合同)$/;

function stripFiller(clause: string): string {
  let out = clause.trim().replace(/^[\s:：、.\-]+|[\s:：、.\-]+$/g, "");
  for (let i = 0; i < 8; i += 1) {
    const next = out.replace(LEAD_FILLER, "").replace(TAIL_FILLER, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** 日期、金额、客户、合同名称这些已经识别出来的内容拿掉后，剩下的话原样放进备注。 */
function buildNotes(raw: string, hits: DateHit[], customer: string): string {
  let rest = raw;
  for (const hit of [...hits].sort((a, b) => b.index - a.index)) {
    rest = `${rest.slice(0, hit.index)} ${rest.slice(hit.index + hit.length)}`;
  }
  const num = "(?:\\d+|[一两二三四五六七八九十])";
  rest = rest
    .replace(new RegExp(`(?:有效期|为期|期限|一共|共)?\\s*${num}\\s*(?:个月|年)\\s*(?:后|期)?`, "g"), " ")
    .replace(/半年\s*(?:后|期)?/g, " ")
    .replace(/(?:合同金额|合同总额|金额|总价|价款)?\s*[是为:：]?\s*\d+(?:\.\d+)?\s*万?\s*元/g, " ")
    .replace(/《[^》]*》/g, " ")
    .replace(/(?:合同名称|合同叫|合同是|这份是|签的是)\s*[:：]?\s*[^，,。；;\s]{2,24}/g, " ")
    .replace(/(?:年度维保|维保|租赁|采购|服务|销售|劳务|框架|保密|代理|供货|施工)合同/g, " ");
  if (customer) {
    rest = rest
      .replace(new RegExp(`(?:客户|甲方|对方)(?:名称|公司|名叫|叫做|是|为|叫)?\\s*[:：]?\\s*${customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), " ")
      .split(customer)
      .join(" ");
  }
  const parts = rest
    .split(/[，,。；;、\s]+/)
    .map(stripFiller)
    .filter((part) => part.length >= 2);
  return parts.join("；");
}

export function parseContractText(text: string, today = todayISO()): Draft {
  const raw = text.trim();
  const draft = emptyDraft(raw);
  if (!raw) return draft;

  const name = findCustomer(raw);
  const kind = findTitle(raw);
  ({ company: draft.customer, type: draft.title } = splitName(name, kind));
  draft.amount = findAmount(raw);

  const hits = findDates(raw, today);
  let signed = "";
  let expires = "";
  const unknown: string[] = [];
  for (const hit of hits) {
    const role = roleFor(raw, hit);
    if (role === "signed" && !signed) signed = hit.iso;
    else if (role === "expires" && !expires) expires = hit.iso;
    else unknown.push(hit.iso);
  }
  for (const iso of unknown) {
    if (!signed) signed = iso;
    else if (!expires) expires = iso;
  }
  if (signed && expires && signed > expires) {
    const swap = signed;
    signed = expires;
    expires = swap;
  }
  if (signed && !expires) {
    const months = durationShift(raw);
    if (months) expires = addMonths(signed, months) ?? "";
  }
  if (expires && !signed) {
    const months = durationShift(raw);
    if (months) signed = addMonths(expires, -months) ?? "";
  }
  if (!signed && !expires && hits.length >= 2) {
    const ordered = [...hits].sort((a, b) => a.iso.localeCompare(b.iso));
    signed = ordered[0].iso;
    expires = ordered[ordered.length - 1].iso;
  } else if (!expires && hits.length === 1 && /到期|届满|截止/.test(raw)) {
    expires = hits[0].iso;
  }

  draft.signedOn = signed;
  draft.expiresOn = expires;
  draft.notes = buildNotes(raw, hits, name);
  return draft;
}
