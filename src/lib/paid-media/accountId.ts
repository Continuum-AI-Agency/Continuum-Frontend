// Meta ad-account id normalization, in one neutral place.
//
// Meta's id is not canonical: the same account is `act_123` or `123` depending on which
// surface produced it. The optimizer's create RPC stores whatever the caller sent, the
// account picker normalizes to the bare form, and the server-side initial-account
// resolution had a third copy of the same regex. Comparing the two forms unequal makes a
// real portfolio silently vanish from its own account, so every comparison goes bare on
// BOTH sides through this function.
//
// Why it lives in lib and not beside the picker: data hooks need it too, and importing it
// from a component module coupled the whole optimizer data layer to that component's
// module graph. A sibling test that mock.module's the picker then erased this export and
// took every optimizer hook down with it — undefined at import time, far from the cause.

export const bareAccountId = (value: string): string => value.replace(/^act_/, '');
