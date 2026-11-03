// An account picker can hold accounts with the same name: Easy Fit has "Easy fit (Read-Only)"
// twice and "Easy Fit (Read-Only)" once. Labelled by name alone, a buyer cannot tell which one
// they are filtering or including (PP-DT-C-ad-account-names-indistinguishable). A label another
// account shares — case aside — carries the end of its account's id; a unique name is left alone.

const idTail = (id: string): string => {
  const digits = id.replace(/\D/g, '');
  return (digits.length >= 4 ? digits : id).slice(-4);
};

export function withDistinctAccountLabels<T extends { id: string; label: string }>(
  accounts: readonly T[],
): T[] {
  const uses = new Map<string, number>();
  const keyOf = (label: string) => label.trim().toLowerCase();
  for (const account of accounts) {
    uses.set(keyOf(account.label), (uses.get(keyOf(account.label)) ?? 0) + 1);
  }
  return accounts.map((account) =>
    (uses.get(keyOf(account.label)) ?? 0) > 1
      ? { ...account, label: `${account.label} · …${idTail(account.id)}` }
      : account,
  );
}
