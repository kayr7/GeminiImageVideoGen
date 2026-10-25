/** @jest-environment node */
import { createSseParser, readSse } from '@/components/prompt-lab/sse';

const stream = 'event: thought\ndata: {"text":"hm"}\n\n: ping\n\nevent: answer\ndata: {"text":"Hello"}\n\nevent: answer\ndata: {"text":" wörld"}\n\nevent: done\ndata: {}\n\n';

describe('SSE parser', () => {
  it('parses multiple events in one chunk and ignores heartbeats', () => {
    const events = createSseParser().push(stream);
    expect(events.map((e) => e.event)).toEqual(['thought', 'answer', 'answer', 'done']);
    expect(events[1].data).toEqual({ text: 'Hello' });
  });

  it('yields identical events when split at every boundary', () => {
    const expected = createSseParser().push(stream);
    for (let i = 1; i < stream.length; i++) {
      const p = createSseParser();
      const got = [...p.push(stream.slice(0, i)), ...p.push(stream.slice(i))];
      expect(got).toEqual(expected);
    }
  });

  it('handles CRLF and char-by-char delivery', () => {
    const p = createSseParser();
    const out = [];
    for (const ch of stream.replace(/\n/g, '\r\n')) out.push(...p.push(ch));
    expect(out).toHaveLength(4);
  });

  it('readSse decodes multi-byte characters split across byte chunks', async () => {
    const bytes = new TextEncoder().encode(stream);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7));
    let n = 0;
    const reader = {
      read: async () => (n < chunks.length ? { done: false, value: chunks[n++] } : { done: true }),
    };
    const events = [];
    for await (const e of readSse(reader)) events.push(e);
    expect(events.map((e) => e.event)).toEqual(['thought', 'answer', 'answer', 'done']);
    expect(events[2].data).toEqual({ text: ' wörld' });
  });
});
