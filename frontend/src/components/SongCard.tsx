import Link from 'next/link';
import Image from 'next/image';
import { Music, Users } from 'lucide-react';
import { formatRating, msToTimestamp } from '@/lib/api';

interface Props {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
  avgRating: number | null;
  contributorCount: number;
}

export default function SongCard({
  id, title, artist, album, albumArtUrl, durationMs, avgRating, contributorCount,
}: Props) {
  return (
    <Link href={`/songs/${id}`} className="group block">
      <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface-1 p-4 transition hover:border-accent/30 hover:bg-surface-2">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-3">
          {albumArtUrl ? (
            <Image src={albumArtUrl} alt={album} fill className="object-cover" sizes="56px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music size={20} className="text-white/20" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white group-hover:text-accent transition">
            {title}
          </p>
          <p className="truncate text-sm text-white/50">{artist}</p>
          <p className="text-xs text-white/30">{msToTimestamp(durationMs)}</p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-accent">{formatRating(avgRating)}</p>
          <p className="flex items-center justify-end gap-1 text-xs text-white/30">
            <Users size={11} />
            {contributorCount}
          </p>
        </div>
      </div>
    </Link>
  );
}
