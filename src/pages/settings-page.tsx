import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { PERMISSIONS } from "@/lib/permissions";

type Props = {
  canExport: boolean;
  note: string;
  onExport: () => void;
  onImport: (file: File | undefined) => void;
};

const ROW = "flex h-14 w-full items-center gap-3 px-4 text-left text-base disabled:opacity-50";

export function SettingsPage({ canExport, note, onExport, onImport }: Props) {
  const importRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">设置</h1>

      <section className="mt-5">
        <h2 className="px-1 text-sm text-muted">数据</h2>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          <button type="button" onClick={onExport} disabled={!canExport} className={ROW}>
            <Download className="size-5 text-primary" />
            导出备份
          </button>
          <button type="button" onClick={() => importRef.current?.click()} className={ROW}>
            <Upload className="size-5 text-primary" />
            导入备份
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            onImport(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {note && <p className="mt-2 px-1 text-sm text-muted">{note}</p>}
      </section>

      <section className="mt-6">
        <h2 className="px-1 text-sm text-muted">权限说明</h2>
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {PERMISSIONS.map((item) => (
            <li key={item.name} className="px-4 py-3">
              <p className="text-base text-ink">{item.name}</p>
              <p className="mt-0.5 text-sm leading-6 text-muted">{item.why}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-xs leading-5 text-muted">
          不读取通讯录、短信、位置和相册；只在你点「上传合同」时读取你选的那一份文件或图片。
        </p>
      </section>

      <section className="mt-6">
        <h2 className="px-1 text-sm text-muted">关于</h2>
        <div className="mt-2 rounded-lg border border-line bg-surface px-4 py-4">
          <p className="text-base font-medium text-ink">提醒 · 版本 1.0</p>
          <h3 className="mt-3 text-sm font-medium text-ink">免责声明</h3>
          <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-muted">
            <li>合同中的日期、金额、公司名称等信息由软件自动识别，可能有误差或遗漏，仅供提醒参考，请务必以合同原件为准。</li>
            <li>到期提醒依赖手机的通知和后台权限，可能因系统限制、省电策略或关机而延迟或无法送达，请勿作为唯一的到期依据。</li>
            <li>因信息识别有误、提醒未送达或数据丢失造成的任何损失，本应用及开发者不承担责任。</li>
            <li>合同数据只保存在本机，不会上传；卸载应用或清除数据会丢失，请定期导出备份。</li>
          </ol>
        </div>
      </section>
    </>
  );
}
