"use client";

let voicesCache: SpeechSynthesisVoice[] | null = null;

function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (voicesCache && voicesCache.length > 0) return Promise.resolve(voicesCache);
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve([]);
  const list = synth.getVoices();
  if (list.length > 0) {
    voicesCache = list;
    return Promise.resolve(list);
  }
  return new Promise((resolve) => {
    const handle = setTimeout(() => {
      voicesCache = synth.getVoices();
      resolve(voicesCache);
    }, 600);
    synth.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(handle);
        voicesCache = synth.getVoices();
        resolve(voicesCache);
      },
      { once: true },
    );
  });
}

function langTagFor(code: string): string {
  switch (code) {
    case "ru":
      return "ru-RU";
    case "en":
      return "en-US";
    case "de":
      return "de-DE";
    case "es":
      return "es-ES";
    case "fr":
      return "fr-FR";
    case "it":
      return "it-IT";
    case "pt":
      return "pt-PT";
    case "ja":
      return "ja-JP";
    case "ko":
      return "ko-KR";
    case "zh":
      return "zh-CN";
    case "tr":
      return "tr-TR";
    case "uk":
      return "uk-UA";
    default:
      return code;
  }
}

export async function speak(text: string, langCode: string, rate = 1): Promise<void> {
  if (typeof window === "undefined") return;
  if (!text.trim()) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const voices = await getVoices();
  const tag = langTagFor(langCode);
  const voice =
    voices.find((v) => v.lang === tag) ??
    voices.find((v) => v.lang.startsWith(langCode)) ??
    null;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = tag;
  utt.rate = Math.max(0.5, Math.min(2, rate));
  if (voice) utt.voice = voice;
  synth.speak(utt);
}

export function stopSpeak() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
