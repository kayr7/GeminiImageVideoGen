import React from 'react';

/** Tiny safe markdown renderer: **bold**, `code`, ``` fences and - / 1. lists. No HTML injection. */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{tok.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code key={`${keyPrefix}-${i++}`} className="rounded bg-gray-200 dark:bg-gray-700 px-1 py-0.5 font-mono text-[0.9em]">
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderText(text: string, keyPrefix: string): React.ReactNode[] {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `${keyPrefix}-p${out.length}`;
      out.push(
        <p key={k} className="whitespace-pre-wrap">
          {renderInline(para.join('\n'), k)}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `${keyPrefix}-l${out.length}`;
      const items = list.items.map((it, idx) => <li key={idx}>{renderInline(it, `${k}-${idx}`)}</li>);
      out.push(
        list.ordered ? (
          <ol key={k} className="list-decimal pl-6 space-y-1">{items}</ol>
        ) : (
          <ul key={k} className="list-disc pl-6 space-y-1">{items}</ul>
        )
      );
      list = null;
    }
  };

  for (const line of lines) {
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out;
}

export default function SimpleMarkdown({ text }: { text: string }) {
  const parts = text.split('```');
  const blocks: React.ReactNode[] = [];
  parts.forEach((part, idx) => {
    if (idx % 2 === 1) {
      const code = part.replace(/^[^\n]*\n/, '');
      blocks.push(
        <pre key={`c${idx}`} className="overflow-x-auto rounded-lg bg-gray-900 text-gray-100 p-3 text-sm font-mono whitespace-pre-wrap">
          {code}
        </pre>
      );
    } else if (part) {
      blocks.push(...renderText(part, `t${idx}`));
    }
  });
  return <div className="space-y-3 break-words">{blocks}</div>;
}
