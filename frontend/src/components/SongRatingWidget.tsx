'use client';

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface Props {
  songId: string;
  currentRating: number | null;
  onUpdate: () => void;
}

export default function SongRatingWidget({ songId, currentRating, onUpdate }: Props) {
  const [value, setValue] = useState<number>(currentRating ?? 5);
  const [saved, setSaved] = useState(currentRating);

  useEffect(() => {
    if (currentRating !== null) {
      setValue(currentRating);
      setSaved(currentRating);
    }
  }, [currentRating]);

  async function commit() {
    await api.post('/api/ratings/song', { songId, rating: value });
    setSaved(value);
    onUpdate();
  }

  async function remove() {
    await api.delete(`/api/ratings/song/${songId}`);
    setValue(5);
    setSaved(null);
    onUpdate();
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white/70">Your Rating</h3>

      <div className="flex items-center gap-4">
        <span className="w-10 text-2xl font-bold tabular-nums">
          {saved !== null
            ? <span className="text-accent">{value.toFixed(1)}</span>
            : <span className="text-accent text-2xl font-bold">—</span>
          }
        </span>
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={value}
          onChange={(e) => setValue(parseFloat(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          className="flex-1 accent-accent"
        />
        <span className="text-sm text-white/30">/ 10</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-white/30">
        {saved !== null ? (
          <>
            <span>Current Rating: <span className="text-white/60">{saved.toFixed(1)}</span></span>
            <button
              onClick={remove}
              className="ml-auto text-white/20 transition hover:text-red-400"
              title="Remove rating"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <span>Drag to rate</span>
        )}
      </div>
    </div>
  );
}
