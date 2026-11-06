import { SpeechRecognition } from "@capacitor-community/speech-recognition";

type Handle = { remove: () => Promise<void> };
let handles: Handle[] = [];

async function clearHandles(): Promise<void> {
  for (const handle of handles) {
    try {
      await handle.remove();
    } catch {
      // ignore
    }
  }
  handles = [];
}

export type SpeechStart = { ok: true } | { ok: false; reason: string };

const KEYBOARD_HINT = "请点输入法键盘上的话筒图标说话，效果一样。";

/**
 * 安卓系统自带的语音识别（不依赖 WebView）。说完一句后系统自动结束，结果由 start() 直接返回。
 * 之前用“边说边出字”模式，部分机型（含华为）不回传中间结果，所以一个字也出不来。
 */
export async function startNativeSpeech(onText: (text: string) => void, onStop: () => void): Promise<SpeechStart> {
  try {
    const { available } = await SpeechRecognition.available();
    if (!available) {
      return { ok: false, reason: `这部手机没有可用的语音识别服务。${KEYBOARD_HINT}` };
    }
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      return { ok: false, reason: `没有麦克风权限，可在「权限说明」里查看。${KEYBOARD_HINT}` };
    }
    await clearHandles();
    handles.push(
      await SpeechRecognition.addListener("listeningState", (data: { status: string }) => {
        if (data.status === "stopped") onStop();
      }),
    );
    // 不等结果，立刻返回“已开始”，结果回来后再填进输入框
    void SpeechRecognition.start({ language: "zh-CN", maxResults: 3, partialResults: false, popup: false })
      .then((result: { matches?: string[] }) => {
        const spoken = result?.matches?.find((item) => item && item.trim());
        if (spoken) onText(spoken.trim());
        else onText("");
      })
      .catch(() => onText(""))
      .finally(() => {
        onStop();
        void clearHandles();
      });
    return { ok: true };
  } catch {
    await clearHandles();
    return { ok: false, reason: `语音识别没能启动。${KEYBOARD_HINT}` };
  }
}

export async function stopNativeSpeech(): Promise<void> {
  try {
    await SpeechRecognition.stop();
  } catch {
    // ignore
  }
  await clearHandles();
}
