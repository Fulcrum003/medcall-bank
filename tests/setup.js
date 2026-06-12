import { vi } from 'vitest';

// Mock canvas (used by confetti())
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  save: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  fillStyle: '',
  fillRect: vi.fn(),
  restore: vi.fn(),
}));

// Mock AudioContext (used by cue()/beep())
global.AudioContext = vi.fn(() => ({
  currentTime: 0,
  state: 'running',
  resume: vi.fn(),
  createOscillator: vi.fn(() => ({
    type: 'sine',
    frequency: { value: 440 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  })),
  destination: {},
}));
global.webkitAudioContext = global.AudioContext;

// Stub requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));

// Stub URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();
