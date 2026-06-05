import { PrismaClient } from '@prisma/client';
import { recomputeAggregation } from '../src/services/aggregation';

const prisma = new PrismaClient();

async function main() {
  const songs = await prisma.song.findMany({
    where: { intervalRatings: { some: {} } },
    select: { id: true, title: true },
  });

  console.log(`Recomputing aggregation for ${songs.length} song(s)...`);

  for (const song of songs) {
    await recomputeAggregation(song.id);
    console.log(`  ✓ ${song.title}`);
  }

  console.log('Done.');
  await prisma.$disconnect();
}

main().catch(console.error);
