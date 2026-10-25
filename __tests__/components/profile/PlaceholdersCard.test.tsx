import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlaceholdersCard from '@/components/profile/PlaceholdersCard';
import { apiFetch } from '@/lib/utils/apiClient';
import { useAuth } from '@/lib/context/AuthContext';
import { resetPlaceholderStore } from '@/lib/hooks/usePlaceholders';

jest.mock('@/lib/utils/apiClient', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/context/AuthContext', () => ({ useAuth: jest.fn() }));

const apiFetchMock = apiFetch as jest.Mock;
const useAuthMock = useAuth as jest.Mock;
const respond = (ok: boolean, body: unknown, status = ok ? 200 : 400) => ({ ok, status, json: async () => body });

const placeholder = (name: string, value: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${name}`,
  userId: 'u1',
  name,
  value,
  description: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const list = (items: unknown[]) => respond(true, { success: true, data: { placeholders: items } });
const one = (item: unknown) => respond(true, { success: true, data: { placeholder: item } });

const confirmSpy = jest.spyOn(window, 'confirm');

beforeEach(() => {
  resetPlaceholderStore();
  apiFetchMock.mockReset();
  confirmSpy.mockReset();
  useAuthMock.mockReturnValue({ token: 't' });
});

describe('PlaceholdersCard', () => {
  it('lists saved placeholders with description and truncated value', async () => {
    apiFetchMock.mockResolvedValueOnce(
      list([placeholder('CONTEXT', 'x'.repeat(300), { description: 'About my company' })]),
    );
    render(<PlaceholdersCard />);
    expect(await screen.findByRole('button', { name: 'Edit CONTEXT' })).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getByText('{{CONTEXT}}')).toBeInTheDocument();
    expect(screen.getByText('About my company')).toBeInTheDocument();
    expect(screen.getByText(/^x+…$/)).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    apiFetchMock.mockResolvedValueOnce(list([]));
    render(<PlaceholdersCard />);
    expect(await screen.findByText(/No placeholders yet/)).toBeInTheDocument();
  });

  it('validates the name client-side and creates a placeholder', async () => {
    apiFetchMock.mockResolvedValueOnce(list([]));
    render(<PlaceholdersCard />);
    await screen.findByText(/No placeholders yet/);

    fireEvent.click(screen.getByRole('button', { name: /Add placeholder/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'my context' } });
    expect(screen.getByText(/Use only letters, digits and underscores/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'We are Acme.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save placeholder' }));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CONTEXT' } });
    expect(screen.getByText('Use it as {{CONTEXT}} in any prompt or template.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'Company' } });
    apiFetchMock.mockResolvedValueOnce(one(placeholder('CONTEXT', 'We are Acme.', { description: 'Company' })));
    fireEvent.click(screen.getByRole('button', { name: 'Save placeholder' }));

    expect(await screen.findByRole('button', { name: 'Edit CONTEXT' })).toBeInTheDocument();
    const [url, init] = apiFetchMock.mock.calls[1];
    expect(url).toBe('/api/placeholders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'CONTEXT', value: 'We are Acme.', description: 'Company' });
  });

  it('shows the backend error on a duplicate name', async () => {
    apiFetchMock.mockResolvedValueOnce(list([]));
    render(<PlaceholdersCard />);
    await screen.findByText(/No placeholders yet/);
    fireEvent.click(screen.getByRole('button', { name: /Add placeholder/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CONTEXT' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'v' } });
    apiFetchMock.mockResolvedValueOnce(respond(false, { detail: 'A placeholder named CONTEXT already exists' }, 409));
    fireEvent.click(screen.getByRole('button', { name: 'Save placeholder' }));
    expect(await screen.findByText('A placeholder named CONTEXT already exists')).toBeInTheDocument();
  });

  it('edits a placeholder', async () => {
    apiFetchMock.mockResolvedValueOnce(list([placeholder('CONTEXT', 'old value')]));
    render(<PlaceholdersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit CONTEXT' }));

    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'new value' } });
    apiFetchMock.mockResolvedValueOnce(one(placeholder('CONTEXT', 'new value')));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('new value')).toBeInTheDocument();
    const [url, init] = apiFetchMock.mock.calls[1];
    expect(url).toBe('/api/placeholders/id-CONTEXT');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ name: 'CONTEXT', value: 'new value', description: null });
  });

  it('deletes a placeholder after confirmation', async () => {
    apiFetchMock.mockResolvedValueOnce(list([placeholder('CONTEXT', 'v'), placeholder('TONE', 'friendly')]));
    render(<PlaceholdersCard />);
    const deleteButton = await screen.findByRole('button', { name: 'Delete CONTEXT' });

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(deleteButton);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValueOnce(true);
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { placeholderId: 'id-CONTEXT' } }));
    fireEvent.click(deleteButton);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete CONTEXT' })).not.toBeInTheDocument(),
    );
    expect(within(screen.getByRole('list')).getByText('{{TONE}}')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/placeholders/id-CONTEXT', { method: 'DELETE' });
    expect(within(document.body).queryByRole('alert')).not.toBeInTheDocument();
  });
});
