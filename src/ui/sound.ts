import { useEffect, useRef } from 'react';
import type { PlayerView } from '../game/view';

const STORAGE_KEY = 'kw.sound';

interface BurstOptions {
  duration: number;
  freq: number;
  q: number;
  gain: number;
  sweepTo?: number;
  attack?: number;
}

interface ToneOptions {
  freq: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  glideTo?: number;
}

/**
 * Card-table sound effects, synthesised with the Web Audio API (no audio files to load).
 * Card sounds are short bursts of filtered noise; jingles are soft triangle-wave notes.
 */
class SoundEffects {
  enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  setEnabled(on: boolean) {
    this.enabled = on;
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    if (on) this.unlock();
  }

  /** Browsers only allow audio after a user gesture: call this from one. */
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** The audio context if sound is on and has been unlocked; never creates one outside a gesture. */
  private now(): number | null {
    if (!this.enabled || !this.ctx || this.ctx.state === 'closed') return null;
    return this.ctx.currentTime;
  }

  private burst(at: number, { duration, freq, q, gain, sweepTo, attack = 0.002 }: BurstOptions) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter).connect(env).connect(this.master!);
    // Start somewhere random in the 1 s noise buffer so repeated sounds don't sound identical.
    src.start(at, Math.random() * Math.max(0, 0.95 - duration));
    src.stop(at + duration + 0.05);
  }

  private tone(at: number, { freq, duration, gain, type = 'triangle', glideTo }: ToneOptions) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  /**
   * Paper sliding over paper: soft noise that swells and fades (no sharp attack), with a slight
   * fast wobble in loudness for the friction grain.
   */
  private slide(at: number, duration: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 500;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.6;
    band.frequency.setValueAtTime(1100, at);
    band.frequency.exponentialRampToValueAtTime(2700, at + duration * 0.7);
    band.frequency.exponentialRampToValueAtTime(1900, at + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + duration * 0.35);
    env.gain.setTargetAtTime(0, at + duration * 0.55, duration * 0.14);
    // Loudness = envelope × (0.75 ± 0.25): the wobble never outlives the envelope.
    const grain = ctx.createGain();
    grain.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 35 + Math.random() * 25;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(grain.gain);
    src.connect(highpass).connect(band).connect(env).connect(grain).connect(this.master!);
    src.start(at, Math.random() * Math.max(0, 0.95 - duration));
    src.stop(at + duration + 0.1);
    lfo.start(at);
    lfo.stop(at + duration + 0.1);
  }

  /** A card drawn from the deck and laid down: a soft slide, then a faint flick as it comes free. */
  cardPlay() {
    const t = this.now();
    if (t === null) return;
    const duration = 0.19 + Math.random() * 0.05;
    this.slide(t, duration, 0.34);
    this.burst(t + duration * 0.8, { duration: 0.03, freq: 4200 + Math.random() * 600, q: 1.8, gain: 0.025, attack: 0.006 });
  }

  private lastHover = 0;

  /** A faint tick when the pointer moves over a card you can play. */
  hover() {
    const t = this.now();
    if (t === null || t - this.lastHover < 0.06) return;
    this.lastHover = t;
    this.burst(t, { duration: 0.03, freq: 5200, q: 2.5, gain: 0.035 });
  }

  /** Riffle shuffle followed by thirteen cards being dealt (in step with the deal animation). */
  deal() {
    const t = this.now();
    if (t === null) return;
    for (let i = 0; i < 14; i++) {
      this.burst(t + i * 0.012, { duration: 0.025, freq: 4200 + Math.random() * 1500, q: 2, gain: 0.05 + Math.random() * 0.05 });
    }
    for (let i = 0; i < 13; i++) {
      this.burst(t + 0.2 + i * 0.04 + Math.random() * 0.01, {
        duration: 0.05,
        freq: 3000 + Math.random() * 700,
        q: 1.4,
        gain: 0.16,
      });
    }
  }

  /** The trick is swept off the table. */
  collect() {
    const t = this.now();
    if (t === null) return;
    this.burst(t, { duration: 0.34, freq: 600, sweepTo: 2600, q: 0.8, gain: 0.2, attack: 0.12 });
  }

  /** Someone bids (brighter) or passes (duller): a wooden tock. */
  bid(pass: boolean) {
    const t = this.now();
    if (t === null) return;
    this.tone(t, { freq: pass ? 420 : 700, glideTo: pass ? 380 : 640, duration: 0.09, gain: 0.14, type: 'sine' });
    this.burst(t, { duration: 0.02, freq: pass ? 1800 : 2600, q: 3, gain: 0.08 });
  }

  /** A gentle chime when it becomes your turn. */
  turn() {
    const t = this.now();
    if (t === null) return;
    this.tone(t, { freq: 880, duration: 0.25, gain: 0.07, type: 'sine' });
    this.tone(t + 0.1, { freq: 1318.5, duration: 0.35, gain: 0.06, type: 'sine' });
  }

  win(delay = 0) {
    const t = this.now();
    if (t === null) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this.tone(t + delay + i * 0.09, { freq, duration: 0.35, gain: 0.12 }),
    );
  }

  lose(delay = 0) {
    const t = this.now();
    if (t === null) return;
    [392, 329.63, 261.63].forEach((freq, i) => this.tone(t + delay + i * 0.15, { freq, duration: 0.4, gain: 0.1 }));
  }

  fanfare(delay = 0) {
    const t = this.now();
    if (t === null) return;
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((freq, i) =>
      this.tone(t + delay + i * 0.11, { freq, duration: i === 5 ? 0.8 : 0.3, gain: 0.12 }),
    );
  }
}

export const sound = new SoundEffects();

const isMyTurn = (v: PlayerView) =>
  (v.phase === 'bidding' && v.bidding?.turn === v.seat) || (v.phase === 'playing' && v.turn === v.seat);

/**
 * Plays sounds for what changed between two consecutive views, so every player hears the same
 * table events (their own cards, other players' cards, bots). The first view stays silent.
 */
export function useGameSounds(view: PlayerView | null, online: boolean) {
  const prev = useRef<PlayerView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!view || !p || p.seat !== view.seat || view.version === p.version) return;
    const me = view.seat;

    if (view.handNo !== p.handNo && view.phase === 'bidding') {
      sound.deal();
    } else {
      const log = view.bidding?.log ?? [];
      if (view.phase === 'bidding' && log.length > (p.bidding?.log.length ?? 0)) {
        sound.bid(log[log.length - 1].bid.kind === 'pass');
      }
      if (view.playedCards.length > p.playedCards.length) sound.cardPlay();
      if (p.trick?.winner != null && view.trick?.winner == null) sound.collect();
    }

    // Only chime when it helps: online (others are waiting) or when this tab is in the background.
    if (isMyTurn(view) && !isMyTurn(p) && (online || document.hidden)) sound.turn();

    if (view.phase === 'handEnd' && p.phase !== 'handEnd') {
      const result = view.history[view.history.length - 1];
      if (result?.contract) {
        if (result.deltas[me] > 0) sound.win(0.35);
        else if (result.deltas[me] < 0) sound.lose(0.35);
      }
    }
    if (view.phase === 'gameOver' && p.phase !== 'gameOver') {
      if (view.scores[me] === Math.max(...view.scores)) sound.fanfare(0.2);
      else sound.lose(0.2);
    }
  }, [view, online]);
}
