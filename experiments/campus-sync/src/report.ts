import { REQUIRED_CAPABILITIES, type Capability, type ProbeResult } from './contract.ts';

/**
 * Findings recorder.
 *
 * The spike answers one question: can Pulse reliably obtain the academic data
 * it needs? This turns probe results into a report that answers it, and keeps
 * course content out of the written record.
 */

export interface Report {
  platform: string;
  baseUrl: string;
  startedAt: string;
  results: ProbeResult[];
}

export function createReport(platform: string, baseUrl: string): Report {
  return { platform, baseUrl, startedAt: new Date().toISOString(), results: [] };
}

/**
 * Keeps a sample small and free of personal data.
 *
 * A findings file may be shared or committed, so only field names and value
 * types are preserved. Actual titles, bodies and URLs are not.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 2) return '...';

  if (Array.isArray(value)) {
    return value.slice(0, 1).map((item) => redact(item, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, string> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = Array.isArray(item) ? `array(${item.length})` : typeof item;
    }
    return output;
  }

  return typeof value;
}

export function record(report: Report, result: ProbeResult): void {
  report.results.push(result);
  const count = result.count === undefined ? '' : ` count=${result.count}`;
  const detail = result.detail === undefined ? '' : ` — ${result.detail}`;
  console.log(`  ${result.status.padEnd(12)} ${result.capability.padEnd(14)}${count}${detail}`);
}

/** Wraps a probe call so one failing capability never ends the run. */
export async function attempt(
  report: Report,
  capability: Capability,
  mechanism: ProbeResult['mechanism'],
  run: () => Promise<{ count: number; sample?: unknown; detail?: string }>,
): Promise<void> {
  try {
    const { count, sample, detail } = await run();
    record(report, {
      capability,
      mechanism,
      status: count > 0 ? 'ok' : 'empty',
      count,
      ...(detail === undefined ? {} : { detail }),
      ...(sample === undefined ? {} : { sample: redact(sample) }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unauthorized = /token|permission|denied|invalid|unauthor/i.test(message);
    record(report, {
      capability,
      mechanism,
      status: unauthorized ? 'unauthorized' : 'error',
      detail: message,
    });
  }
}

/**
 * The spike's exit criterion.
 *
 * Passing means courses, materials and the essential assignment and date data
 * were all obtained. Announcements are recorded but not required, because the
 * specification treats them as available only where the platform exposes them.
 */
export function evaluate(report: Report): {
  passed: boolean;
  missing: Capability[];
  summary: string;
} {
  const essential: Capability[] = ['courses', 'assignments', 'due_dates', 'materials'];
  const byCapability = new Map(report.results.map((result) => [result.capability, result]));

  const missing = essential.filter((capability) => {
    const result = byCapability.get(capability);
    return !result || (result.status !== 'ok' && result.status !== 'empty');
  });

  const passed = missing.length === 0;
  return {
    passed,
    missing,
    summary: passed
      ? `${report.platform}: essential data reachable`
      : `${report.platform}: blocked on ${missing.join(', ')}`,
  };
}

export function toMarkdown(report: Report): string {
  const { passed, missing } = evaluate(report);
  const lines: string[] = [
    `# Campus Sync findings — ${report.platform}`,
    '',
    `- Host: ${report.baseUrl}`,
    `- Run: ${report.startedAt}`,
    `- Essential data reachable: ${passed ? 'yes' : 'no'}`,
  ];

  if (!passed) lines.push(`- Missing: ${missing.join(', ')}`);

  lines.push('', '## Capabilities', '', '| Capability | Status | Mechanism | Count | Detail |');
  lines.push('|---|---|---|---|---|');

  for (const capability of REQUIRED_CAPABILITIES) {
    const result = report.results.find((entry) => entry.capability === capability);
    if (!result) {
      lines.push(`| ${capability} | not probed | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${capability} | ${result.status} | ${result.mechanism} | ${result.count ?? '—'} | ${result.detail ?? '—'} |`,
    );
  }

  lines.push('', '## Notes', '', '<!-- Record what worked, what blocked, and the fallback. -->', '');
  return lines.join('\n');
}
