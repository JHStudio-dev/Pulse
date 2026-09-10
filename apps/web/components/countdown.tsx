'use client';

import { useEffect, useState } from 'react';

/**
 * Time remaining until an instant.
 *
 * Computed after mount rather than during render: the server and the browser
 * would otherwise disagree on "now" and React would report a hydration
 * mismatch. Until then the slot stays empty rather than showing a stale value.
 */

function describe(msRemaining: number): string {
  if (msRemaining <= 0) return 'Empieza ahora';

  const minutes = Math.round(msRemaining / 60_000);
  if (minutes < 60) return `En ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `En ${hours} h` : `En ${hours} h ${rest} min`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'Mañana' : `En ${days} días`;
}

export function Countdown({ startsAt }: { startsAt: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const target = new Date(startsAt).getTime();
    const update = () => setLabel(describe(target - Date.now()));

    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [startsAt]);

  if (label === null) return null;
  return <span>{label}</span>;
}
