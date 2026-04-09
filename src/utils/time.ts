export function toIsoString(value: number | Date): string {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function relativeTime(iso?: string): string {
    if (!iso) return 'unknown';
    const timestamp = new Date(iso).getTime();
    if (Number.isNaN(timestamp)) return iso;
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return iso.slice(0, 10);
}

export function makeRunId(now = new Date(), random = Math.random()): string {
    const stamp = now
        .toISOString()
        .replace(/:/g, '-')
        .replace(/\.\d{3}Z$/, 'Z');
    const suffix = Math.floor(random * 36 ** 6)
        .toString(36)
        .padStart(6, '0')
        .slice(0, 6);
    return `${stamp}_${suffix}`;
}
