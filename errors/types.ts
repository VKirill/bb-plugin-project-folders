/**
 * One message a person can see when something fails, in every UI language.
 * `{name}` placeholders are filled from the error's params; user content
 * (project names, paths) is never translated.
 */
export type ErrorText = {
  ru: string;
  en: string;
  es: string;
  fr: string;
  de: string;
  pt: string;
  zh: string;
  ja: string;
  ko: string;
  hi: string;
  ar: string;
};

/** Checks a catalog part at compile time without widening its ids. */
export const errorTexts = <K extends string>(texts: Record<K, ErrorText>) =>
  texts;
