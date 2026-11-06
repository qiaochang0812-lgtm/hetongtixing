import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications, type LocalNotificationSchema } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { addMonths, formatCN, todayISO, type Contract } from "@/lib/contracts";

const CHANNEL = "contracts";

export type RemindState = "ok" | "denied" | "web" | "error";

function hashId(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1;
}

function at9(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}

function shiftDays(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * 把所有合同的提醒重新排一遍（先清掉旧的再排新的，所以改日期/删除/已阅都不会留下过期提醒）。
 * 每份合同最多三次：到期前一个月、前一周、到期当天，都在早上 9 点。已过去的时间点跳过。
 * ask=false 时只在已经有通知权限的情况下排程，不会主动弹权限框。
 */
export async function syncReminders(rows: Contract[], ask: boolean): Promise<RemindState> {
  if (!Capacitor.isNativePlatform()) return "web";
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted" && ask) perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return "denied";

    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: "合同到期提醒",
      importance: 4,
      visibility: 1,
      vibration: true,
    });

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    const now = Date.now();
    const list: LocalNotificationSchema[] = [];
    for (const row of rows) {
      const monthStart = addMonths(row.expiresOn, -1);
      const points: { kind: string; iso: string; title: string }[] = [];
      if (!row.acknowledged && monthStart) points.push({ kind: "month", iso: monthStart, title: "合同一个月后到期" });
      if (!row.acknowledged) points.push({ kind: "week", iso: shiftDays(row.expiresOn, -7), title: "合同一周后到期" });
      points.push({ kind: "day", iso: row.expiresOn, title: "合同今天到期" });
      for (const point of points) {
        const when = at9(point.iso);
        if (when.getTime() <= now) continue;
        list.push({
          id: hashId(`${row.id}:${point.kind}`),
          title: `提醒 · ${point.title}`,
          body: `${row.customer}的${row.title}，到期日 ${formatCN(row.expiresOn)}`,
          channelId: CHANNEL,
          schedule: { at: when, allowWhileIdle: true },
        });
      }
    }
    list.sort((a, b) => a.schedule!.at!.getTime() - b.schedule!.at!.getTime());
    if (list.length > 0) await LocalNotifications.schedule({ notifications: list.slice(0, 200) });
    return "ok";
  } catch {
    return "error";
  }
}

export function backupFileName(now = new Date()): string {
  return `qiqi-backup-${todayISO(now)}.json`;
}

function webDownload(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 导出备份：手机上弹出系统分享面板（可存到文件、发给微信等），电脑浏览器直接下载。 */
export async function exportBackup(rows: Contract[]): Promise<string> {
  const text = JSON.stringify({ app: "qiqi", version: 1, contracts: rows }, null, 2);
  const name = backupFileName();
  if (!Capacitor.isNativePlatform()) {
    webDownload(text, name, "application/json;charset=utf-8");
    return "已导出备份文件。";
  }
  try {
    const file = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: name, url: file.uri, dialogTitle: "导出备份" });
    return "";
  } catch (err) {
    const message = String((err as { message?: string })?.message ?? err);
    if (/cancel/i.test(message)) return "";
    return "导出失败，请稍后再试。";
  }
}
