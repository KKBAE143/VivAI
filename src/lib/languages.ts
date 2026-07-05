/**
 * Languages offered across every live AI feature (viva, presentation, pitch).
 *
 * Gemini Live supports 70+ languages, so we expose the ones most useful to
 * Indian B.Tech students: English, the major regional languages, and the
 * popular English-mixed variants ("-lish") that people actually speak in class.
 * The backend simply forwards the chosen label into the system prompt, which
 * knows how to handle both pure and blended languages.
 */
export const LIVE_LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish",
  "Telugu",
  "Tenglish",
  "Tamil",
  "Tanglish",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi",
] as const;

export type LiveLanguage = (typeof LIVE_LANGUAGES)[number];
