import { addMonths, cnSmall, emptyDraft, isISODate, type Draft } from "@/lib/contracts";
import { splitName } from "@/lib/names";

const CJK = "\\u4e00-\\u9fff";

/** PDF 抽出来的文字常在汉字之间夹空格，先压掉，关键词才好匹配。 */
function normalize(raw: string): string {
  let text = raw.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[\u3000]/g, " ");
  const gap = new RegExp(`([${CJK}（）()：:，,。；;、\\d])[ \\t]+(?=[${CJK}（）()：:，,。；;、\\d])`, "g");
  for (let i = 0; i < 3; i += 1) text = text.replace(gap, "$1");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

const CN_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function cnNumber(token: string): number {
  if (!token) return NaN;
  if (token === "十") return 10;
  if (token.startsWith("十")) return 10 + (CN_DIGIT[token[1]] ?? NaN);
  if (token.endsWith("十")) return (CN_DIGIT[token[0]] ?? NaN) * 10;
  if (token.includes("十")) {
    const [a, b] = token.split("十");
    return (CN_DIGIT[a] ?? NaN) * 10 + (CN_DIGIT[b] ?? NaN);
  }
  return CN_DIGIT[token] ?? NaN;
}

/** “二〇二五年十一月五日” → “2025年11月5日”，方便后面统一匹配。 */
function arabicDates(text: string): string {
  return text.replace(
    /([〇零一二三四五六七八九]{4})年\s*([一二三四五六七八九十]{1,3})月\s*([一二三四五六七八九十]{1,3})[日号]/g,
    (whole, y: string, m: string, d: string) => {
      const year = [...y].map((c) => CN_DIGIT[c]).join("");
      const month = cnNumber(m);
      const day = cnNumber(d);
      if (!/^\d{4}$/.test(year) || Number.isNaN(month) || Number.isNaN(day)) return whole;
      return `${year}年${month}月${day}日`;
    },
  );
}

const DATE = "(\\d{4})\\s*[年\\-./]\\s*(\\d{1,2})\\s*[月\\-./]\\s*(\\d{1,2})\\s*[日号]?";

function toISO(y: string, m: string, d: string): string {
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isISODate(iso) ? iso : "";
}

function firstDateAfter(text: string, keyword: RegExp, span = 24): string {
  const re = new RegExp(`(?:${keyword.source})[^\\d\\n]{0,${span}}${DATE}`);
  const match = text.match(re);
  return match ? toISO(match[1], match[2], match[3]) : "";
}

function allDates(text: string): { iso: string; index: number }[] {
  const out: { iso: string; index: number }[] = [];
  const re = new RegExp(DATE, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const iso = toISO(match[1], match[2], match[3]);
    if (iso) out.push({ iso, index: match.index });
  }
  return out;
}

function findTerm(text: string): { start: string; end: string } | null {
  const re = new RegExp(
    `(?:自|从)?\\s*${DATE}\\s*(?:起|开始)?\\s*(?:至|到|—|–|-|－|～|~)\\s*${DATE}\\s*(?:止|结束|届满)?`,
  );
  const match = text.match(re);
  if (!match) return null;
  const start = toISO(match[1], match[2], match[3]);
  const end = toISO(match[4], match[5], match[6]);
  return start && end && start <= end ? { start, end } : null;
}

function termMonths(text: string): number | null {
  const clause = text.match(/(?:合同期限|合同有效期|有效期限|有效期|服务期限|租赁期限|合作期限|履行期限|期限)[^。；\n]{0,30}/);
  if (!clause) return null;
  const num = "(\\d+|[一两二三四五六七八九十])";
  const years = clause[0].match(new RegExp(`${num}\\s*年`));
  if (years) {
    const n = cnSmall(years[1]);
    if (n && n <= 30) return n * 12;
  }
  const months = clause[0].match(new RegExp(`${num}\\s*个月`));
  if (months) {
    const n = cnSmall(months[1]);
    if (n && n <= 360) return n;
  }
  return null;
}

function findAmount(text: string): string {
  const keyed = text.match(
    /(?:合同总金额|合同总价款?|合同金额|合同价款|总价款|总金额|价款总计|合计金额|合同总价|总计|合计)[^\d¥￥\n]{0,14}(?:人民币|RMB|¥|￥)?\s*([\d,，]+(?:\.\d+)?)\s*(万)?\s*元?/,
  );
  const loose = keyed ?? text.match(/(?:人民币|RMB|¥|￥)\s*([\d,，]+(?:\.\d+)?)\s*(万)?\s*元?/);
  if (!loose) return "";
  const digits = loose[1].replace(/[,，]/g, "").replace(/\.0+$/, "");
  if (!digits || Number(digits) === 0) return "";
  return `${digits}${loose[2] ? "万" : ""}元`;
}

function party(text: string, label: "甲" | "乙"): string {
  const re = new RegExp(`${label}方\\s*(?:[（(][^）)\\n]{0,12}[）)])?\\s*[:：]\\s*([^\\s，,；;（(\\n]{2,40})`);
  const match = text.match(re);
  if (!match) return "";
  const name = match[1].replace(/[（(].*$/, "").trim();
  return /盖章|签字|签章|名称/.test(name) ? "" : name;
}

function findTitle(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 14);
  for (const line of lines) {
    if (line.length < 4 || line.length > 32 || /编号|[:：，,。]/.test(line)) continue;
    if (/(?:合同|协议)(?:书)?$/.test(line)) return line;
  }
  return "";
}

function clip(sentence: string, max: number): string {
  const clean = sentence
    .replace(/^[\s\d.、（()）第条款章节一二三四五六七八九十]+/, "")
    .replace(/\s+/g, "")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function sentenceWith(text: string, test: RegExp, fine = false): string {
  for (const part of text.split(fine ? /[。；，,\n]/ : /[。；\n]/)) {
    if (test.test(part)) return part;
  }
  return "";
}

function keyNotes(text: string): string {
  const items: string[] = [];
  const number = text.match(/合同编号\s*[:：]\s*([A-Za-z0-9\-_/]{3,40})/);
  if (number) items.push(`合同编号：${number[1]}`);
  const b = party(text, "乙");
  if (b) items.push(`乙方：${b}`);

  const renew = sentenceWith(text, /自动续|自动延|续约|续期|顺延/);
  if (renew) items.push(`续约：${clip(renew, 70)}`);
  const notice = sentenceWith(text, /提前\d+\s*(?:日|天|个月)[^。；\n]{0,12}(?:书面)?通知/, true);
  if (notice) items.push(`通知：${clip(notice, 70)}`);
  const pay = sentenceWith(text, /(?:付款|支付)[^。；\n]{0,30}(?:\d|日|期|%|％|比例|预付|首付|尾款)/);
  if (pay) items.push(`付款：${clip(pay, 80)}`);
  const breach = sentenceWith(text, /违约金/, true);
  if (breach) items.push(`违约：${clip(breach, 70)}`);
  return items.filter((item) => item.length > 4).join("；");
}

export type DocParse = { draft: Draft; found: number };

export function parseContractDocument(rawText: string): DocParse {
  const text = arabicDates(normalize(rawText));
  const draft = emptyDraft("");

  const term = findTerm(text);
  const dates = allDates(text);

  let signed = firstDateAfter(text, /签订日期|签订时间|签约日期|签约时间|签署日期|签署时间|合同签订日|签订于|订立日期|合同日期/);
  if (!signed) {
    // 落款处常见“日期：2025年11月5日”，取最后一个“日期”后面的
    const tail = [...text.matchAll(new RegExp(`日\\s*期\\s*[:：]\\s*${DATE}`, "g"))].pop();
    if (tail) signed = toISO(tail[1], tail[2], tail[3]);
  }
  if (!signed && term) signed = term.start;

  let expires = term?.end ?? "";
  if (!expires) {
    expires = firstDateAfter(text, /到期日期|到期日|终止日期|终止日|届满日|有效期至|有效期截止|有效期限至|截止日期|截止至|届满之日|期满之日/);
  }
  if (!expires) {
    const months = termMonths(text);
    const base = term?.start || signed || dates[0]?.iso || "";
    if (months && base) expires = addMonths(base, months) ?? "";
  }
  if (!signed && dates.length > 0) {
    const sorted = [...dates].sort((a, b) => a.iso.localeCompare(b.iso));
    signed = sorted[0].iso;
  }
  if (signed && expires && signed > expires) {
    const swap = signed;
    signed = expires;
    expires = swap;
  }

  draft.signedOn = signed;
  draft.expiresOn = expires;
  draft.amount = findAmount(text);
  ({ company: draft.customer, type: draft.title } = splitName(party(text, "甲"), findTitle(text)));
  draft.notes = keyNotes(text);

  const found = [draft.customer, draft.title, draft.signedOn, draft.expiresOn, draft.amount].filter(Boolean).length;
  return { draft, found };
}
