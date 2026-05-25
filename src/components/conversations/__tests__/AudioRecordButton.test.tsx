import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AudioRecordButton, selectAudioRecordingMimeType } from '../AudioRecordButton';

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType || 'audio/webm';
  }

  start = vi.fn();

  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) });
    this.onstop?.();
  });
}

describe('AudioRecordButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:audio-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function recordAudio() {
    render(<AudioRecordButton onRecordComplete={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true }));

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(screen.getByText('0:00')).toBeInTheDocument());
  }

  it('keeps the recorded preview when sending fails', async () => {
    const onRecordComplete = vi.fn().mockRejectedValue(new Error('provider rejected audio'));
    render(<AudioRecordButton onRecordComplete={onRecordComplete} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(screen.getByText('0:00')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button')[1]);

    await waitFor(() => expect(onRecordComplete).toHaveBeenCalledWith(expect.any(Blob)));
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(document.querySelector('audio')).toHaveAttribute('src', 'blob:audio-preview');
  });

  it('clears the recorded preview after a successful send', async () => {
    const onRecordComplete = vi.fn().mockResolvedValue(undefined);
    render(<AudioRecordButton onRecordComplete={onRecordComplete} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(screen.getByText('0:00')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button')[1]);

    await waitFor(() => expect(screen.queryByText('0:00')).not.toBeInTheDocument());
    expect(onRecordComplete).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('records audio as webm when the browser supports it', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((mimeType) => mimeType === 'audio/webm');
    await recordAudio();

    const audio = document.querySelector('audio');
    expect(audio).toHaveAttribute('src', 'blob:audio-preview');
    expect(audio).toHaveAttribute('preload', 'metadata');
  });

  it('prefers WhatsApp-friendly audio formats before webm', () => {
    const isTypeSupported = vi.fn((mimeType: string) => mimeType === 'audio/mp4' || mimeType === 'audio/webm');

    expect(selectAudioRecordingMimeType({ isTypeSupported })).toBe('audio/mp4');
    expect(isTypeSupported).toHaveBeenCalledWith('audio/ogg;codecs=opus');
    expect(isTypeSupported).toHaveBeenCalledWith('audio/ogg');
    expect(isTypeSupported).toHaveBeenCalledWith('audio/mp4');
  });
});
