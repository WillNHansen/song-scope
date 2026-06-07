'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Clock, Pencil, Check, X, Play } from 'lucide-react';
import api, { msToTimestamp } from '@/lib/api';
import { playTrackAt, onPlayerReady } from '@/lib/spotify';
import type { IntervalRating, Song } from '@/types';

interface Props {
  song: Song;
  intervals: IntervalRating[];
  onUpdate: () => void;
}

// Accepts M:SS, M:SS.m, M:SS.mm, M:SS.mmm
function parseTimestamp(str: string): number | null {
  const match = str.trim().match(/^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  const millis = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
  return mins * 60000 + secs * 1000 + millis;
}

interface EditState {
  id: string;
  startStr: string;
  endStr: string;
  rating: number;
  saving: boolean;
  error: string;
}

export default function IntervalRater({ song, intervals, onUpdate }: Props) {
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');
  const [rating, setRating] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  useEffect(() => onPlayerReady(setPlayerReady), []);

  async function submit() {
    setError('');
    const startMs = parseTimestamp(startStr);
    const endMs = parseTimestamp(endStr);
    if (startMs === null || endMs === null) {
      setError('Use M:SS.mmm format (e.g. 1:42.500)');
      return;
    }
    if (endMs <= startMs) {
      setError('End must be after start');
      return;
    }
    if (endMs > song.durationMs) {
      setError('Interval exceeds song duration');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/ratings/interval', {
        songId: song.id,
        startMs,
        endMs,
        rating,
      });
      setStartStr('');
      setEndStr('');
      setRating(8);
      onUpdate();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(iv: IntervalRating) {
    setEditing({
      id: iv.id,
      startStr: msToTimestamp(iv.startMs),
      endStr: msToTimestamp(iv.endMs),
      rating: iv.rating,
      saving: false,
      error: '',
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const startMs = parseTimestamp(editing.startStr);
    const endMs = parseTimestamp(editing.endStr);
    if (startMs === null || endMs === null) {
      setEditing({ ...editing, error: 'Use M:SS.mmm format (e.g. 1:42.500)' });
      return;
    }
    if (endMs <= startMs) {
      setEditing({ ...editing, error: 'End must be after start' });
      return;
    }
    if (endMs > song.durationMs) {
      setEditing({ ...editing, error: 'Interval exceeds song duration' });
      return;
    }
    setEditing({ ...editing, saving: true, error: '' });
    try {
      await api.patch(`/api/ratings/interval/${editing.id}`, {
        rating: editing.rating,
        startMs,
        endMs,
      });
      setEditing(null);
      onUpdate();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEditing({ ...editing, saving: false, error: msg ?? 'Failed to save' });
    }
  }

  async function deleteInterval(id: string) {
    await api.delete(`/api/ratings/interval/${id}`);
    onUpdate();
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
        Rate an Interval
      </h3>

      <div className="rounded-xl border border-white/10 bg-surface-1 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-white/50">Start</label>
            <input
              placeholder="1:42.5"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 font-mono text-sm text-white placeholder:text-white/20 focus:border-accent/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">End</label>
            <input
              placeholder="1:48.123"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 font-mono text-sm text-white placeholder:text-white/20 focus:border-accent/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">Rating: {rating.toFixed(1)}</label>
            <input
              type="range"
              min={0}
              max={10}
              step={0.1}
              value={rating}
              onChange={(e) => setRating(parseFloat(e.target.value))}
              className="mt-2 w-full accent-accent"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={submit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {intervals.length > 0 && (
        <div className="space-y-2">
          {intervals.map((iv) =>
            editing?.id === iv.id ? (
              <div
                key={iv.id}
                className="rounded-lg border border-accent/30 bg-surface-2 px-4 py-3"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-white/40">Start</label>
                    <input
                      value={editing.startStr}
                      onChange={(e) => setEditing({ ...editing, startStr: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-1.5 font-mono text-sm text-white focus:border-accent/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/40">End</label>
                    <input
                      value={editing.endStr}
                      onChange={(e) => setEditing({ ...editing, endStr: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-1.5 font-mono text-sm text-white focus:border-accent/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/40">
                      Rating: {editing.rating.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.1}
                      value={editing.rating}
                      onChange={(e) => setEditing({ ...editing, rating: parseFloat(e.target.value) })}
                      className="mt-2 w-full accent-accent"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={editing.saving}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50"
                    >
                      <Check size={14} />
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-white/50 transition hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {editing.error && <p className="mt-2 text-xs text-red-400">{editing.error}</p>}
              </div>
            ) : (
              <div
                key={iv.id}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-1 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {playerReady && (
                    <button
                      onClick={() => playTrackAt(song.spotifyId, iv.startMs)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20 text-green-400 transition hover:bg-green-500/30"
                      title="Play from here"
                    >
                      <Play size={10} fill="currentColor" />
                    </button>
                  )}
                  <Clock size={14} className="text-accent/60" />
                  <span className="font-mono text-sm text-white/70">
                    {msToTimestamp(iv.startMs)} – {msToTimestamp(iv.endMs)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-accent">{iv.rating.toFixed(1)}</span>
                  <button
                    onClick={() => startEdit(iv)}
                    className="text-white/20 transition hover:text-accent"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteInterval(iv.id)}
                    className="text-white/20 transition hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
