// Words that never name a search-term theme, in the two languages our accounts search in.
// Language data, not UI copy: it lives outside optimizer/ so the vocabulary guard there keeps
// meaning "no Spanish a user reads".
export const SEARCH_TERM_STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a al con de del el en la las los mi me para por que un una y cerca ' +
    'an and for in my near of on the to with'
  ).split(' '),
);
