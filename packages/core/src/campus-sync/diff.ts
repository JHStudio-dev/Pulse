import type {
  CampusSyncDiffState,
  CampusSyncItem,
  CampusSyncItemDraft,
  CampusSyncItemInput,
  JsonObject,
  JsonValue,
} from '@pulse/types';

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

  return `{${entries.join(',')}}`;
}

/** Stable, non-cryptographic fingerprint used only for change detection. */
export function fingerprintCampusPayload(input: CampusSyncItemDraft): string {
  const value: JsonObject = {
    kind: input.kind,
    externalId: input.externalId,
    sourceUrl: input.sourceUrl,
    payload: input.payload,
  };

  const serialized = stableStringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function prepareCampusSyncItem(input: CampusSyncItemDraft): CampusSyncItemInput {
  return {
    ...input,
    contentHash: fingerprintCampusPayload(input),
  };
}

export function classifyCampusSyncItem(
  existing: Pick<CampusSyncItem, 'contentHash'> | null,
  incoming: CampusSyncItemInput,
): CampusSyncDiffState {
  if (!existing) return 'new';
  return existing.contentHash === incoming.contentHash ? 'unchanged' : 'changed';
}
