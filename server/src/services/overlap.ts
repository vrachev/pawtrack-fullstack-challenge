export interface SlotLike {
  scheduledDate: string;
  startTime: string;
  endTime: string;
}

export function slotDurationMs(startTime: string, endTime: string): number {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = toMin(startTime);
  const endMin = toMin(endTime);
  const wrap = endMin < startMin ? 24 * 60 : 0;
  return (endMin - startMin + wrap) * 60_000;
}

export function slotsOverlap(a: SlotLike, b: SlotLike): boolean {
  const aStart = new Date(a.scheduledDate).getTime();
  const aEnd = aStart + slotDurationMs(a.startTime, a.endTime);
  const bStart = new Date(b.scheduledDate).getTime();
  const bEnd = bStart + slotDurationMs(b.startTime, b.endTime);
  return aStart < bEnd && aEnd > bStart;
}
