// Toast copy for the realize-batch summary. Kept pure so noun/verb agreement
// ('1 draft has' vs '3 drafts have') is testable without streaming the hook.

export type MediaReadyToastCopy = {
  title: string;
  description: string;
};

export function formatMediaReadyToast(ready: number, failed: number): MediaReadyToastCopy {
  if (ready <= 0) {
    return {
      title: 'Media generation failed',
      description: `${failed} draft${failed === 1 ? '' : 's'} failed.`,
    };
  }

  const subject = ready === 1 ? '1 draft has' : `${ready} drafts have`;
  const failureSuffix = failed > 0 ? `, ${failed} failed` : '';
  return {
    title: 'Media generated',
    description: `${subject} media ready${failureSuffix}.`,
  };
}
