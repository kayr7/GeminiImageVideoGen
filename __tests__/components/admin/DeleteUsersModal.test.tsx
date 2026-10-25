import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeleteUsersModal from '@/components/admin/DeleteUsersModal';
import { apiFetch } from '@/lib/utils/apiClient';

jest.mock('@/lib/utils/apiClient', () => ({ apiFetch: jest.fn() }));

const apiFetchMock = apiFetch as jest.Mock;
const respond = (ok: boolean, body: unknown) => ({ ok, status: ok ? 200 : 400, json: async () => body });

const alice = { id: 'u1', email: 'alice@test.de', mediaCount: 3 };
const bob = { id: 'u2', email: 'bob@test.de', mediaCount: 2 };

beforeEach(() => apiFetchMock.mockReset());

describe('DeleteUsersModal (single)', () => {
  it('shows email and media count, and disables delete until the email is typed', () => {
    render(<DeleteUsersModal users={[alice]} onDeleted={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Delete user alice@test.de?')).toBeInTheDocument();
    expect(screen.getByText(/Also delete their 3 generated/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Delete user' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type alice@test.de/), { target: { value: 'alice@test' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type alice@test.de/), { target: { value: 'alice@test.de' } });
    expect(button).toBeEnabled();
  });

  it('sends deleteMedia=true by default and false when unchecked', async () => {
    apiFetchMock.mockResolvedValue(respond(true, { success: true, data: { deletedMedia: 3 } }));
    const onDeleted = jest.fn();
    const { unmount } = render(<DeleteUsersModal users={[alice]} onDeleted={onDeleted} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Type alice/), { target: { value: alice.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/users/u1?deleteMedia=true', { method: 'DELETE' });
    unmount();

    apiFetchMock.mockClear();
    render(<DeleteUsersModal users={[alice]} onDeleted={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Type alice/), { target: { value: alice.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/admin/users/u1?deleteMedia=false');
  });

  it('shows the backend detail on error', async () => {
    apiFetchMock.mockResolvedValue(respond(false, { detail: 'Remove admin rights before deleting' }));
    render(<DeleteUsersModal users={[alice]} onDeleted={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Type alice/), { target: { value: alice.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    expect(await screen.findByText('Remove admin rights before deleting')).toBeInTheDocument();
  });
});

describe('DeleteUsersModal (bulk)', () => {
  it('requires typing DELETE and posts userIds with deleteMedia', async () => {
    apiFetchMock.mockResolvedValue(
      respond(true, { success: true, data: { deleted: ['u1'], failed: [], deletedMedia: 3 } }),
    );
    render(<DeleteUsersModal bulk users={[alice, bob]} onDeleted={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Also delete their 5 generated/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Delete users' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    expect(button).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/users/bulk-delete');
    expect(JSON.parse(init.body)).toEqual({ userIds: ['u1', 'u2'], deleteMedia: false });
  });

  it('shows a summary with failures and reasons', async () => {
    apiFetchMock.mockResolvedValue(
      respond(true, {
        success: true,
        data: {
          deleted: ['u1'],
          failed: [{ userId: 'u2', reason: 'Remove admin rights before deleting' }],
          deletedMedia: 3,
        },
      }),
    );
    const onDeleted = jest.fn();
    render(<DeleteUsersModal bulk users={[alice, bob]} onDeleted={onDeleted} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete users' }));
    expect(await screen.findByText(/Deleted 1 user and 3 media items/)).toBeInTheDocument();
    expect(screen.getByText(/bob@test.de: Remove admin rights before deleting/)).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledWith(expect.objectContaining({ deletedMedia: 3 }));
  });
});
