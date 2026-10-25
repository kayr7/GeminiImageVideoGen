import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TemplateSelector from '@/components/shared/TemplateSelector';
import { apiFetch } from '@/lib/utils/apiClient';
import { useAuth } from '@/lib/context/AuthContext';

jest.mock('@/lib/utils/apiClient', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/context/AuthContext', () => ({ useAuth: jest.fn() }));

const apiFetchMock = apiFetch as jest.Mock;
const useAuthMock = useAuth as jest.Mock;
const respond = (ok: boolean, body: unknown) => ({ ok, status: ok ? 200 : 400, json: async () => body });

const template = {
  id: 't1',
  userId: 'u1',
  name: 'Product shot',
  mediaType: 'image' as const,
  templateText: 'A photo of {{PRODUCT}} for {{CONTEXT}}',
  variables: ['PRODUCT', 'CONTEXT'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

let currentPrompt = '';

function Harness({ initial = '' }: { initial?: string }) {
  const [prompt, setPrompt] = useState(initial);
  currentPrompt = prompt;
  return (
    <>
      <TemplateSelector mediaType="image" value={prompt} onChange={setPrompt} />
      <textarea aria-label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
    </>
  );
}

const confirmSpy = jest.spyOn(window, 'confirm');

beforeEach(() => {
  apiFetchMock.mockReset();
  confirmSpy.mockReset();
  useAuthMock.mockReturnValue({ token: 't' });
});

const selectTemplate = async () => {
  await screen.findByRole('option', { name: 'Product shot' });
  fireEvent.change(screen.getByLabelText('Prompt Template'), { target: { value: 't1' } });
};

describe('TemplateSelector', () => {
  it('is hidden and silent when logged out', () => {
    useAuthMock.mockReturnValue({ token: null });
    const { container } = render(<TemplateSelector mediaType="image" value="" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('puts the raw template text (with placeholders) into the prompt', async () => {
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { templates: [template] } }));
    render(<Harness />);
    await selectTemplate();
    expect(currentPrompt).toBe(template.templateText);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/text/templates?media_type=image');
  });

  it('asks before replacing a typed prompt', async () => {
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { templates: [template] } }));
    confirmSpy.mockReturnValue(false);
    render(<Harness initial="my own prompt" />);
    await selectTemplate();
    expect(confirmSpy).toHaveBeenCalled();
    expect(currentPrompt).toBe('my own prompt');
  });

  it('updates the template with the raw edited text, keeping placeholders', async () => {
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { templates: [template] } }));
    render(<Harness />);
    await selectTemplate();

    const edited = 'A studio photo of {{PRODUCT}} for {{CONTEXT}}, {{STYLE}}';
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: edited } });
    expect(screen.getByText(/Modified/)).toBeInTheDocument();

    apiFetchMock.mockResolvedValueOnce(
      respond(true, { success: true, data: { template: { ...template, templateText: edited } } }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Update Current Template/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = apiFetchMock.mock.calls[1];
    expect(url).toBe('/api/text/templates/t1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      templateText: edited,
      variables: ['PRODUCT', 'CONTEXT', 'STYLE'],
    });
    await waitFor(() => expect(screen.queryByText(/Modified/)).not.toBeInTheDocument());
  });

  it('saves a new template from the raw prompt and shows backend errors', async () => {
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { templates: [] } }));
    render(<Harness initial="Logo for {{CONTEXT}}" />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Save as New Template/ }));
    fireEvent.change(screen.getByPlaceholderText('Enter template name'), { target: { value: 'Logo' } });
    apiFetchMock.mockResolvedValueOnce(respond(false, { detail: 'Template name already exists' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Template name already exists')).toBeInTheDocument();
    const [, init] = apiFetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({
      name: 'Logo',
      mediaType: 'image',
      templateText: 'Logo for {{CONTEXT}}',
      variables: ['CONTEXT'],
    });
  });

  it('deletes the selected template after confirmation', async () => {
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { templates: [template] } }));
    render(<Harness />);
    await selectTemplate();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /Delete Template/ }));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValueOnce(true);
    apiFetchMock.mockResolvedValueOnce(respond(true, { success: true, data: { templateId: 't1' } }));
    fireEvent.click(screen.getByRole('button', { name: /Delete Template/ }));

    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Product shot' })).not.toBeInTheDocument(),
    );
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/text/templates/t1', { method: 'DELETE' });
  });
});
