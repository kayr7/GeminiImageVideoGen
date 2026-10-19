import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

(global as any).TextDecoder = (global as any).TextDecoder ?? NodeTextDecoder;
(global as any).TextEncoder = (global as any).TextEncoder ?? NodeTextEncoder;

import PromptLabPage from '@/app/prompt/page';
import PromptLab from '@/components/prompt-lab/PromptLab';
import type { PromptLabConfig } from '@/components/prompt-lab/types';

const model = (canDisable: boolean) => ({
  id: 'm1',
  name: 'Model One',
  description: 'desc',
  thinking: {
    canDisable,
    min: canDisable ? 0 : 128,
    max: 24576,
    defaultBudget: -1,
    presets: [
      { label: 'Off', budget: 0 },
      { label: 'Low', budget: 1024 },
      { label: 'Dynamic', budget: -1 },
    ],
  },
});

const makeConfig = (over: Partial<PromptLabConfig> = {}, canDisable = true): PromptLabConfig => ({
  enabled: true,
  expiresAt: null,
  maxInputTokens: 100,
  maxOutputTokens: 2048,
  allowHistory: true,
  defaultModel: 'm1',
  models: [model(canDisable)],
  ...over,
});

const jsonResponse = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

const sseResponse = () => {
  const bytes = new TextEncoder().encode(
    'event: answer\ndata: {"text":"hi"}\n\nevent: usage\ndata: {"promptTokens":3,"thoughtsTokens":0,"outputTokens":1,"totalTokens":4,"firstTokenMs":100,"latencyMs":200,"model":"m1","thinkingBudget":0}\n\nevent: done\ndata: {}\n\n'
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

describe('Prompt Lab controls', () => {
  it('renders thinking presets with Off enabled when model can disable', () => {
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Off' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Low' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dynamic' })).toBeInTheDocument();
  });

  it('disables Off when the model cannot disable thinking', () => {
    render(<PromptLab config={makeConfig({}, false)} onInactive={() => {}} />);
    const off = screen.getByRole('radio', { name: 'Off' });
    expect(off).toBeDisabled();
    expect(off).toHaveAttribute('title', 'This model always thinks');
  });

  it('blocks sending when input exceeds the token limit', () => {
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'a'.repeat(401) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'a'.repeat(400) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('compare mode issues two requests with budgets 0 and the selected one', async () => {
    mockFetch(makeConfig());
    render(<PromptLab config={makeConfig()} onInactive={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Low' }));
    fireEvent.click(screen.getByLabelText('Compare thinking'));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    });
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u).includes('/generate'));
      expect(calls).toHaveLength(2);
      const budgets = calls.map(([, init]) => JSON.parse(init.body).thinking.budget).sort((a, b) => a - b);
      expect(budgets).toEqual([0, 1024]);
    });
    expect((await screen.findAllByText('hi')).length).toBe(2);
  });
});
