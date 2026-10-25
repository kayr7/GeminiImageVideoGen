import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlaceholderFields from '@/components/shared/PlaceholderFields';
import { apiFetch } from '@/lib/utils/apiClient';
import { useAuth } from '@/lib/context/AuthContext';
import { resetPlaceholderStore } from '@/lib/hooks/usePlaceholders';

jest.mock('@/lib/utils/apiClient', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/context/AuthContext', () => ({ useAuth: jest.fn() }));

const apiFetchMock = apiFetch as jest.Mock;
const useAuthMock = useAuth as jest.Mock;
const respond = (ok: boolean, body: unknown, status = ok ? 200 : 400) => ({ ok, status, json: async () => body });

const placeholder = (name: string, value: string) => ({
  id: `id-${name}`,
  userId: 'u1',
  name,
  value,
  description: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

let latestValues: Record<string, string> = {};

function Harness({ text, initial = {} }: { text: string; initial?: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  latestValues = values;
  return <PlaceholderFields text={text} values={values} onChange={setValues} />;
}

const listResponse = (items: unknown[]) => respond(true, { success: true, data: { placeholders: items } });

beforeEach(() => {
  resetPlaceholderStore();
  apiFetchMock.mockReset();
  useAuthMock.mockReturnValue({ token: 't' });
  latestValues = {};
});

describe('PlaceholderFields', () => {
  it('renders nothing without placeholders', async () => {
    apiFetchMock.mockResolvedValue(listResponse([]));
    const { container } = render(<Harness text="plain prompt" />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills fields from saved placeholders and marks them as saved', async () => {
    apiFetchMock.mockResolvedValue(listResponse([placeholder('CONTEXT', 'We are Acme.')]));
    render(<Harness text="Write about {{CONTEXT}} and {{TOPIC}}" />);

    const context = await screen.findByDisplayValue('We are Acme.');
    expect(context).toHaveAttribute('id', 'placeholder-CONTEXT');
    expect(screen.getByText('saved')).toBeInTheDocument();
    expect(screen.getByLabelText('{{TOPIC}}')).toHaveValue('');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/placeholders');
    expect(latestValues).toEqual({ CONTEXT: 'We are Acme.' });
  });

  it('does not clobber a value the user already typed', async () => {
    apiFetchMock.mockResolvedValue(listResponse([placeholder('CONTEXT', 'saved value')]));
    render(<Harness text="{{CONTEXT}}" initial={{ CONTEXT: 'my own' }} />);
    await waitFor(() => expect(screen.getByText('differs from saved')).toBeInTheDocument());
    expect(screen.getByLabelText('{{CONTEXT}}')).toHaveValue('my own');

    fireEvent.change(screen.getByLabelText('{{CONTEXT}}'), { target: { value: '' } });
    await waitFor(() => expect(latestValues.CONTEXT).toBe(''));
    expect(screen.getByLabelText('{{CONTEXT}}')).toHaveValue('');
  });

  it('saves the edited value as default via upsert by name', async () => {
    apiFetchMock.mockResolvedValueOnce(listResponse([placeholder('CONTEXT', 'old')]));
    render(<Harness text="{{CONTEXT}}" />);
    const field = await screen.findByDisplayValue('old');
    expect(screen.queryByRole('button', { name: /Save as default/ })).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'new value' } });
    apiFetchMock.mockResolvedValueOnce(
      respond(true, { success: true, data: { placeholder: placeholder('CONTEXT', 'new value') } }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Save as default/ }));

    await waitFor(() => expect(screen.getByText('saved')).toBeInTheDocument());
    const [url, init] = apiFetchMock.mock.calls[1];
    expect(url).toBe('/api/placeholders/by-name/CONTEXT');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ value: 'new value' });
  });

  it('shows the backend error when saving fails', async () => {
    apiFetchMock.mockResolvedValueOnce(listResponse([]));
    render(<Harness text="{{NEW}}" />);
    fireEvent.change(screen.getByLabelText('{{NEW}}'), { target: { value: 'x' } });
    apiFetchMock.mockResolvedValueOnce(respond(false, { detail: 'You can save at most 100 placeholders' }));
    fireEvent.click(screen.getByRole('button', { name: /Save as default/ }));
    expect(await screen.findByText('You can save at most 100 placeholders')).toBeInTheDocument();
  });

  it('does not call the API or offer saving when logged out', () => {
    useAuthMock.mockReturnValue({ token: null });
    render(<Harness text="{{CONTEXT}}" initial={{ CONTEXT: 'typed' }} />);
    expect(screen.getByLabelText('{{CONTEXT}}')).toHaveValue('typed');
    expect(screen.queryByRole('button', { name: /Save as default/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Manage in Profile/)).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('uses a multi-line field for long values', async () => {
    apiFetchMock.mockResolvedValue(listResponse([placeholder('CONTEXT', 'line one\nline two')]));
    render(<Harness text="{{CONTEXT}} {{SHORT}}" />);
    const context = await screen.findByLabelText('{{CONTEXT}}');
    await waitFor(() => expect(context).toHaveAttribute('rows', '3'));
    expect(screen.getByLabelText('{{SHORT}}')).toHaveAttribute('rows', '1');
  });
});
