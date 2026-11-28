import { useCallback, useEffect, useRef, useState } from 'react';

type SR = any;

/** Web Speech API dictation, where the browser supports it. */
export function useSpeech(onText: (text: string) => void) {
  const Ctor: SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : null;
  const supported = !!Ctor;
  const [listening, setListening] = useState(false);
  const rec = useRef<SR>(null);

  useEffect(() => () => rec.current?.abort?.(), []);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>)
        .map((res: any) => res[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, [Ctor, listening, onText, supported]);

  return { supported, listening, toggle };
}
