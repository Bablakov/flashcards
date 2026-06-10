"use client";

import { Capacitor } from "@capacitor/core";

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
  const tag = langTagFor(langCode);

  // Native (Android-приложение): системный TTS-движок вместо WebView speechSynthesis,
  // который в Android WebView часто молчит (getVoices пустой).
  if (Capacitor.isNativePlatform()) {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.stop();
      await TextToSpeech.speak({ text, lang: tag, rate: Math.max(0.1, Math.min(2, rate)) });
      return;
    } catch {
      // если нативный движок недоступен — падаем в web-ветку ниже
    }
  }

  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const voices = await getVoices();
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
  if (Capacitor.isNativePlatform()) {
    import("@capacitor-community/text-to-speech")
      .then(({ TextToSpeech }) => TextToSpeech.stop())
      .catch(() => {});
    return;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
