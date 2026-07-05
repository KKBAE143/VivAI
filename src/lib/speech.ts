/**
 * Browser speech helpers for the AI Viva / Presentation features.
 *
 * - useSpeechToText: wraps the Web Speech API (SpeechRecognition) for dictation.
 * - useTextToSpeech: wraps speechSynthesis to read questions aloud with a mute toggle.
 *
 * Both are feature-detected and degrade gracefully (supported === false) so the
 * UI can fall back to typing / silent mode on unsupported browsers (e.g. Firefox).
 */
import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionInstance = any;

function getRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

const LANG_MAP: Record<string, string> = {
  English: "en-IN",
  Hindi: "hi-IN",
  Hinglish: "en-IN",
};

export interface SpeechToText {
  supported: boolean;
  listening: boolean;
  /** Final recognized text accumulated since the last reset. */
  transcript: string;
  /** In-progress (not yet finalized) words. */
  interim: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechToText(language = "English"): SpeechToText {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const recognition: SpeechRecognitionInstance = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANG_MAP[language] ?? "en-IN";

    recognition.onresult = (event: any) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalRef.current += `${text} `;
        } else {
          interimText += text;
        }
      }
      setTranscript(finalRef.current.trim());
      setInterim(interimText);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      recognitionRef.current = null;
    };
  }, [language]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if already started; ignore.
    }
  }, [listening]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // no-op
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterim("");
  }, []);

  return { supported, listening, transcript, interim, start, stop, reset };
}

export interface TextToSpeech {
  supported: boolean;
  speaking: boolean;
  muted: boolean;
  speak: (text: string) => void;
  cancel: () => void;
  toggleMute: () => void;
}

export function useTextToSpeech(language = "English"): TextToSpeech {
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || mutedRef.current || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANG_MAP[language] ?? "en-IN";
      utterance.rate = 0.98;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [supported, language],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next && supported) window.speechSynthesis.cancel();
      return next;
    });
  }, [supported]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { supported, speaking, muted, speak, cancel, toggleMute };
}
