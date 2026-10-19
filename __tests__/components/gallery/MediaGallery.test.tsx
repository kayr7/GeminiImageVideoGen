import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import MediaGallery from '@/components/gallery/MediaGallery';
import { apiFetch } from '@/lib/utils/apiClient';
import { useAuth } from '@/lib/context/AuthContext';

jest.mock('@/lib/utils/apiClient', () => ({
  apiFetch: jest.fn(),
  resolveApiUrl: (p: string) => (/^[a-z][a-z0-9+.-]*:/i.test(p) ? p : `/base${p}`),
}));
jest.mock('@/lib/context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockApiFetch = apiFetch as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const makeItem = (id: string, type = 'image', extra: Record<string, unknown> = {}) => ({
  id,
  type,
  prompt: `prompt ${id}`,
  model: 'm',
  createdAt: '2025-01-01T00:00:00.000Z',
  fileSize: 1,
  mimeType: 'image/png',
  userId: 'u1',
  userEmail: null,
  ipAddress: null,
  url: `/api/media/${id}?exp=1&sig=a`,
  thumbnailUrl: `/api/media/${id}/thumbnail?exp=1&sig=b`,
  details: { mode: null, negativePrompt: null, firstFrame: null, lastFrame: null, referenceImages: [], sourceImages: [] },
  ...extra,
});

const listResponse = (media: unknown[], pages = 1) => ({
  ok: true,
  json: async () => ({ success: true, data: { media, total: media.length, page: 1, limit: 24, pages } }),
});

describe('MediaGallery', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockUseAuth.mockReturnValue({ token: 't', user: { roles: ['user'] } });
  });

  it('renders grid from list response with signed thumbnail urls, without extra fetches', async () => {
    mockApiFetch.mockResolvedValue(listResponse([makeItem('a'), makeItem('b', 'video')]));
    render(<MediaGallery />);

    const img = await screen.findByAltText('prompt a');
    expect(img).toHaveAttribute('src', '/base/api/media/a/thumbnail?exp=1&sig=b');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('prompt b')).toBeInTheDocument();
    // Only the list request; no thumbnail fetches, no blob URLs.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/media/list?page=1&limit=24');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows email and IP for admins', async () => {
    mockUseAuth.mockReturnValue({ token: 't', user: { roles: ['admin'] } });
    mockApiFetch.mockResolvedValue(
      listResponse([makeItem('a', 'image', { userEmail: 'student@x.de', ipAddress: '1.2.3.4' })])
    );
    render(<MediaGallery />);
    expect(await screen.findByText('student@x.de')).toBeInTheDocument();
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not show email for non-admins', async () => {
    mockApiFetch.mockResolvedValue(listResponse([makeItem('a')]));
    render(<MediaGallery />);
    await screen.findByAltText('prompt a');
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('type filter requests with &type=video', async () => {
    mockApiFetch.mockResolvedValue(listResponse([makeItem('a')]));
    render(<MediaGallery />);
    await screen.findByAltText('prompt a');

    fireEvent.click(screen.getByRole('button', { name: 'Videos' }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith('/api/media/list?page=1&limit=24&type=video')
    );
  });

  it('loads the next page via Load more', async () => {
    mockApiFetch
      .mockResolvedValueOnce(listResponse([makeItem('a')], 2))
      .mockResolvedValueOnce(listResponse([makeItem('b')], 2));
    render(<MediaGallery />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load More' }));
    expect(await screen.findByAltText('prompt b')).toBeInTheDocument();
    expect(mockApiFetch.mock.calls[1][0]).toBe('/api/media/list?page=2&limit=24');
  });
});
