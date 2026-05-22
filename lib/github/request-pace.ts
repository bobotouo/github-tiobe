/** 串行闸门：相邻两次 GitHub 请求之间至少间隔 `minGapMs`（降低 secondary rate limit） */
export function createSequentialGate(minGapMs: number) {
  let chain = Promise.resolve();

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      try {
        return await fn();
      } finally {
        if (minGapMs > 0) {
          await new Promise<void>((r) => setTimeout(r, minGapMs));
        }
      }
    });
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
