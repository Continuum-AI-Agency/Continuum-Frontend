// What the account reading says about its own inputs: which one it could not read, and why. It is
// generated copy, so it follows the account's language — Spanish for every account the board
// serves today, as readAdAccount's reasons are (accountReading.ts). The board's hook
// (useAdAccountReading) and the signal mappers (src/lib/optimizer/adAccountSignals.ts) say these
// sentences through the functions below, so the optimizer surface ships no Spanish literal of its
// own (optimizerVocabulary.test.ts).

/** The platform whose read is named in a sentence. */
export type ReadingCopyPlatform = 'google_ads' | 'meta';

const PLATFORM_NAME: Record<ReadingCopyPlatform, string> = {
  google_ads: 'Google',
  meta: 'Meta',
};

/** The brand's approval chain could not be read: the account is read without one. */
export function readingApprovalNotRead(): string {
  return 'No se leyó si la marca pide aprobación: la cuenta se lee sin cadena.';
}

/** The Optimizer's producer (optimizer_get_account_platform_metrics) did not answer. */
export function readingWindowNotRead(): string {
  return 'No se leyeron el gasto ni los resultados de la ventana: el productor no respondió.';
}

/** The producer measures nothing on the account: no portfolio reads it yet. */
export function readingWindowNotMeasured(): string {
  return 'El Optimizer todavía no mide el gasto de esta cuenta: ningún portafolio la lee.';
}

/** The producer's only account on the platform is another one. */
export function readingWindowOtherAccount(accountId: string): string {
  return `El Optimizer mide otra cuenta de esta plataforma (${accountId}), no esta.`;
}

/** The producer sums several accounts of the platform into one figure. */
export function readingWindowSummed(accounts: number): string {
  return `El Optimizer suma ${accounts} cuentas de esta plataforma en una cifra: no se separa el gasto de esta.`;
}

/** The detectors' pending cards (Google) or the account read (Meta) could not be read. */
export function readingCardsNotRead(platform: ReadingCopyPlatform): string {
  return platform === 'google_ads'
    ? 'No se leyeron las tarjetas de los detectores de Google: la lectura falló.'
    : 'No se leyó la lectura de la cuenta de Meta: la lectura falló.';
}

/** The platform's live campaign read failed; `message` is the read's own error when it gave one. */
export function readingCampaignsNotRead(
  platform: ReadingCopyPlatform,
  message: string | null,
): string {
  const name = PLATFORM_NAME[platform];
  return message
    ? `No se leyeron las campañas de ${name} ("${message}").`
    : `No se leyeron las campañas de ${name}: la lectura falló.`;
}

/** The brand's granted ad accounts could not be read, so its Google Ads customer is unknown. */
export function readingCampaignsAccountsNotRead(): string {
  return 'No se leyeron las campañas: no se pudo leer qué cuentas tiene concedidas la marca.';
}

/** The brand has no Google Ads customer granted. */
export function readingCampaignsNoGoogleAccount(): string {
  return 'No se leyeron las campañas: la marca no tiene una cuenta de Google Ads concedida.';
}
