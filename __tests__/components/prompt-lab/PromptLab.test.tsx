import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

(global as any).TextDecoder = (global as any).TextDecoder ?? NodeTextDecoder;
(global as any).TextEncoder = (global as any).TextEncoder ?? NodeTextEncoder;

import PromptLabPage from '@/app/prompt/page';
import PromptLab from '@/components/prompt-lab/PromptLab';
import type { PromptLabConfig } from '@/components/prompt-lab/types';

const budgetModel = {
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  description: 'desc',
  supportsTemperature: true,
  thinking: {
    kind: 'budget' as const,
    canDisable: true,
    presets: [
      { label: 'Off', budget: 0 },
      { label: 'Low', budget: 1024 },
      { label: 'High', budget: 8192 },
      { label: 'Dynamic', budget: -1 },
    ],
    default: { budget: -1 },
    note: 'Only model where thinking is truly off',
  },
};

const levelModel = {
  id: 'gemini-3.8-flash',
  name: 'Gemini 3.8 Flash',
  description: 'desc3',
  supportsTemperature: false,
  thinking: {
    kind: 'level' as const,
    canDisable: false,
    presets: [
      { label: 'Low', level: 'low' as const },
      { label: 'Medium', level: 'medium' as const },
      { label: 'High', level: 'high' as const },
    ],
    default: { level: 'medium' },
    note: 'Lowest is low, no off',
  },
};

const makeConfig = (over: Partial<PromptLabConfig> = {}): PromptLabConfig => ({
  enabled: true,
  expiresAt: null,
  maxInputTokens: 100,
  maxOutputTokens: 2048,
  allowHistory: true,
  defaultModel: 'gemini-3.8-flash',
  models: [levelModel, budgetModel],
  ...over,
});

const jsonResponse = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

const sseResponse = () => {
  const bytes = new TextEncoder().encode(
    'event: answer\ndata: {"text":"hi"}\n\nevent: usage\ndata: {"promptTokens":3,"thoughtsTokens":0,"outputTokens":1,"totalTokens":4,"firstTokenMs":100,"latencyMs":200,"model":"m1","thinkingBudget":null,"thinkingLevel":"low"}\n\nevent: done\ndata: {}\n\n'
  );
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })) }) },
  };
};

const mockFetch = (config: PromptLabConfig) => {
  (global.fetch as jest.Mock).mockImplementation(async (url: string) =>
    String(url).includes('/generate') ? sseResponse() : jsonResponse(config)
  );
};

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
});

describe('Prompt Lab page', () => {
  it('shows the inactive view when disabled', async () => {
    mockFetch(makeConfig({ enabled: false }));
    render(<PromptLabPage />);
    expect(await screen.findByText(/not active right now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('shows the lab when enabled', async () => {
    mockFetch(makeConfig());
    render(<PromptLabPage />);
    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument();
  });
});

const generateBodies = () =>
  (global.fetch as jest.Mock).mock.calls
    .filter(([u]) => String(u).includes('/generate'))
    .map(([, init]) => JSON.parse(init.body));

describe('Prompt Lab controls', () => {
  it('renders level presets and the note, without Off', () => {
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Low' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'High' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Off' })).toBeNull();
    expect(screen.getByText(/no off/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 2.5 Flash · Off/)).toBeInTheDocument();
  });

  it('renders Off for budget models', () => {
    render(<PromptLab config={makeConfig({ defaultModel: 'gemini-2.5-flash' })} onInactive={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Off' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dynamic' })).toBeInTheDocument();
  });

  it('hides temperature for models without support', () => {
    const { unmount } = render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show advanced/i }));
    expect(screen.queryByLabelText('Temperature')).toBeNull();
    unmount();
    render(<PromptLab config={makeConfig({ defaultModel: 'gemini-2.5-flash' })} onInactive={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show advanced/i }));
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();
  });

  it('blocks sending when input exceeds the token limit', () => {
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'a'.repeat(401) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'a'.repeat(400) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('sends {level} and no temperature for a level model', async () => {
    mockFetch(makeConfig());
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'High' }));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    await waitFor(() => expect(generateBodies()).toHaveLength(1));
    const body = generateBodies()[0];
    expect(body.thinking).toEqual({ level: 'high' });
    expect(body).not.toHaveProperty('temperature');
    expect(await screen.findByText('low')).toBeInTheDocument();
  });

  it('compare defaults to 2.5 Flash Off vs the selected model at high', async () => {
    mockFetch(makeConfig());
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    fireEvent.click(screen.getByLabelText('Compare thinking'));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    });
    await waitFor(() => expect(generateBodies()).toHaveLength(2));
    const bodies = generateBodies();
    const left = bodies.find((b) => b.model === 'gemini-2.5-flash');
    const right = bodies.find((b) => b.model === 'gemini-3.8-flash');
    expect(left.thinking).toEqual({ budget: 0 });
    expect(right.thinking).toEqual({ level: 'high' });
    expect(await screen.findByText('Gemini 2.5 Flash · Off')).toBeInTheDocument();
    expect(screen.getByText('Gemini 3.8 Flash · High')).toBeInTheDocument();
    expect((await screen.findAllByText('hi')).length).toBe(2);
  });

  it('compare falls back to the lowest preset when 2.5 Flash is not allowed', async () => {
    const cfg = makeConfig({ models: [levelModel] });
    mockFetch(cfg);
    render(<PromptLab config={cfg} onInactive={() => {}} />);
    fireEvent.click(screen.getByLabelText('Compare thinking'));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    });
    await waitFor(() => expect(generateBodies()).toHaveLength(2));
    expect(generateBodies().map((b) => b.thinking.level).sort()).toEqual(['high', 'low']);
  });
});
