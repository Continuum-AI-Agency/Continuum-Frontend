// One way into Jaina with a question already written. Contextual entry points (an
// Optimizer row, a portfolio card, a saved dashboard's refresh) all build the same href,
// and the Jaina tab reads the `prompt` param on open.

export function jainaPromptHref(prompt: string): string {
  return `/scale?tab=jaina&prompt=${encodeURIComponent(prompt)}`;
}
