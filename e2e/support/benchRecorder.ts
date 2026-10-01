export type BenchRecorder = {
  notes: string[];
  step<T>(name: string, run: () => Promise<T>): Promise<T>;
  record(step: string, grade: 'PASS' | 'FAIL' | 'SKIP', detail?: string): void;
  print(): void;
};

export function createBenchRecorder(bench: string, notes: string[]): BenchRecorder {
  const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  return {
    notes,
    async step(name, run) {
      try {
        const result = await run();
        graded.push({ step: name, grade: 'PASS' });
        return result;
      } catch (error) {
        graded.push({
          step: name,
          grade: 'FAIL',
          detail: error instanceof Error ? error.message.split('\n')[0] : String(error),
        });
        throw error;
      }
    },
    record(step, grade, detail) {
      graded.push({ step, grade, detail });
    },
    print() {
      const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
      for (const result of graded) {
        if (result.grade === 'PASS') counts.pass += 1;
        else if (result.grade === 'SKIP') counts.skip += 1;
        else counts.fail += 1;
      }
      console.log(
        JSON.stringify({
          bench,
          startedAt,
          durationMs: Date.now() - startedMs,
          results: graded,
          notes,
          counts,
          exitCode: counts.fail > 0 ? 1 : 0,
        }),
      );
    },
  };
}
