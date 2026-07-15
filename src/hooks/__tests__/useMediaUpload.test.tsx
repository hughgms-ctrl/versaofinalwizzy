import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMediaUpload } from '../useMediaUpload';

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      })),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({
      data: { path: 'conversation-1/audio.webm' },
      error: null,
    });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: 'https://storage.example/audio.webm' },
    });
  });

  it('uploads recorded webm audio with the original mime type and extension', async () => {
    const { result } = renderHook(() => useMediaUpload());

    const uploaded = await result.current.uploadAudioBlob(
      new Blob(['audio'], { type: 'audio/webm' }),
      'conversation-1',
      'org-1',
    );

    expect(uploaded).toEqual({
      url: 'https://storage.example/audio.webm',
      path: 'conversation-1/audio.webm',
    });

    const [path, file] = uploadMock.mock.calls[0];
    // WRITE escopado por org: o path enviado ao storage começa com o orgId.
    expect(path).toMatch(/^org-1\/conversation-1\//);
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('audio.webm');
    expect(file.type).toBe('audio/webm');
  });

  it('normalizes ogg opus blobs before upload', async () => {
    const { result } = renderHook(() => useMediaUpload());

    await result.current.uploadAudioBlob(
      new Blob(['audio'], { type: 'audio/ogg;codecs=opus' }),
      'conversation-1',
      'org-1',
    );

    const [, file] = uploadMock.mock.calls[0];
    expect(file.name).toBe('audio.ogg');
    expect(file.type).toBe('audio/ogg');
  });

  it('uses m4a extension for browser mp4 audio blobs', async () => {
    const { result } = renderHook(() => useMediaUpload());

    await result.current.uploadAudioBlob(
      new Blob(['audio'], { type: 'audio/mp4' }),
      'conversation-1',
      'org-1',
    );

    const [, file] = uploadMock.mock.calls[0];
    expect(file.name).toBe('audio.m4a');
    expect(file.type).toBe('audio/mp4');
  });

  it('falls back to webm when the browser does not provide a mime type', async () => {
    const { result } = renderHook(() => useMediaUpload());

    await result.current.uploadAudioBlob(new Blob(['audio']), 'conversation-1', 'org-1');

    await waitFor(() => expect(uploadMock).toHaveBeenCalled());
    const [, file] = uploadMock.mock.calls[0];
    expect(file.name).toBe('audio.webm');
    expect(file.type).toBe('audio/webm');
  });
});
