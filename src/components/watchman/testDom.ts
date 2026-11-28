// The shared Bun DOM setup omits these real jsdom constructors, which UI SDK
// uses to inspect disabled fieldsets. Keep the additional globals local to these tests.
for (const name of ['HTMLFieldSetElement', 'HTMLLegendElement'] as const) {
  if (!(name in globalThis))
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true });
}
