/** 把 AsyncIterable<object> 转成 NDJSON 的 ReadableStream<Uint8Array> */
export const toNdjsonStream = <T>(
  iter: AsyncIterable<T>,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const it = iter[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel(reason) {
      await it.return?.(reason);
    },
  });
};