// What the adaptive board writes in the account's language: the reading's notes, each lens's
// takeaway and the tokens it reads from campaign names. It lives in contracts, beside
// readAdAccount and the recommendation titles (recommendation-title.ts), because generated copy
// follows the account while the optimizer surface ships English chrome only — the vocabulary
// guard (src/components/paid-media/optimizer/optimizerVocabulary.test.ts) holds that line.
// Each unit owns its file; exported names carry the unit's prefix so the re-exports never clash.
export * from './googleMixAuctionSignalCopy';
export * from './googleTermsQualityPmaxCopy';
export * from './metaViewsCopy';
export * from './readingCopy';
