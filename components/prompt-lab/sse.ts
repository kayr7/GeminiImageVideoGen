export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Incremental Server-Sent Events parser. Feed it arbitrary text chunks; it
 * returns the complete events found so far and buffers any partial line.
 * Lines starting with ':' (heartbeats) are ignored. `data` is JSON-parsed
 * when possible, otherwise left as a string.
 */
export function createSseParser() {
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const flush = (out: SseEvent[]) => {
    if (dataLines.length > 0 || eventName !== 'message') {
      const raw = dataLines.join('\n');
      let data: unknown = raw;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
      } else {
        data = {};
      }
      out.push({ event: eventName, data });
    }
    eventName = 'message';
    dataLines = [];
  };

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      const out: SseEvent[] = [];
      let idx: number;
      while ((idx = buffer.search(/\r\n|\n|\r/)) !== -1) {
        const line = buffer.slice(0, idx);
        const sepLen = buffer.startsWith('\r\n', idx) ? 2 : 1;
        // A lone trailing \r might be the first half of \r\n; wait for more.
        if (buffer[idx] === '\r' && idx + 1 >= buffer.length) break;
        buffer = buffer.slice(idx + sepLen);
        if (line === '') {
          flush(out);
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          let value = colon === -1 ? '' : line.slice(colon + 1);
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'event') eventName = value;
          else if (field === 'data') dataLines.push(value);
        }
      }
      return out;
    },
  };
}

/** Async generator over a streamed response body. */
export async function* readSse(
  reader: { read(): Promise<{ done: boolean; value?: Uint8Array }> }
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  const parser = createSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      const tail = parser.push(decoder.decode() + '\n\n');
      for (const e of tail) yield e;
      return;
    }
    for (const e of parser.push(decoder.decode(value, { stream: true }))) yield e;
  }
}
