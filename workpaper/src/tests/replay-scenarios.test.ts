import { describe, expect, it } from 'vitest';
import { compareVersions, displayValue, projectReplay, projectReplayEvidence, projectScenarios } from '@/lib/replay/projections';
import { DEFAULT_AS_OF, documentAvailableAt } from '@/lib/packet/availability';
import { getPacket } from '@/lib/packet/load';
import { redact } from '@/lib/security/redaction';
import type { AdjustmentRecord } from '@/lib/events/types';

describe('read-only engine comparisons', () => {
  it('independently reproduces 63 and 89 changed values, including added/removed lines', () => {
    const march = compareVersions('v1', 'v2')!;
    const june = compareVersions('v2', 'v3')!;
    expect(march.rows).toHaveLength(63);
    expect(june.rows).toHaveLength(89);
    expect(march.declaredChangeCount).toBe(63);
    expect(june.declaredChangeCount).toBe(89);
    expect(march.rows.some(r => r.kind === 'added')).toBe(true);
    expect(march.rows.some(r => r.kind === 'removed')).toBe(true);
    expect(march.rows.find(r => r.key === 'F1040.24')).toMatchObject({ old: 77200, new: 77470, delta: 270 });
    expect(june.rows.find(r => r.key === 'F1040.33')).toMatchObject({ old: 41742, new: 77742, delta: 36000 });
    expect(compareVersions('v3', 'v3')?.rows).toEqual([]);
    expect(compareVersions('v4', 'v3')).toBeNull();
    expect(displayValue(0.6347)).toBe('0.6347');
    expect(displayValue(null)).toBe('—');
    expect(displayValue(0)).toBe('0');
  });
  it('flags overlapping old-version decisions without applying them to the target', () => {
    const changed = compareVersions('v1', 'v2')!.rows.find(r => r.kind === 'changed')!;
    const adjustment = { claimKey: changed.key, engineVersion: 'v1', effectiveValue: 123, reversed: false, reason: 'Supported correction', eventId: 'old-event' } as AdjustmentRecord;
    const original = JSON.stringify(getPacket().return_versions);
    expect(compareVersions('v1', 'v2', [adjustment])?.overlaps[0]).toMatchObject({ conflict: true, supportedValue: 123 });
    expect(compareVersions('v1', 'v2', [{ ...adjustment, reversed: true }])?.overlaps).toEqual([]);
    expect(JSON.stringify(getPacket().return_versions)).toBe(original);
  });
});

describe('isolated timeline replay', () => {
  it('gates documents, messages, versions, and staff at the selected instant', () => {
    const first = projectReplay('tl-04')!;
    expect(first.version).toBe('v1');
    expect(first.documents.map(d => d.id)).not.toContain('D31');
    expect(first.actors.map(a => a.id)).not.toContain('st-04');
    expect(first.actors.map(a => a.id)).not.toContain('st-06');
    const second = projectReplay('tl-08')!;
    expect(second.version).toBe('v2');
    expect(second.versionChange?.rows).toHaveLength(63);
    expect(second.documents.find(d => d.id === 'D30')?.superseded).toBe(true);
    const current = projectReplay()!;
    expect(current.version).toBe('v3');
    expect(current.versionChange?.rows).toHaveLength(89);
    expect(current.documents.map(d => d.id)).not.toContain('D71');
    expect(current.documents.map(d => d.id)).not.toContain('D72');
    expect(current.messages.map(m => m.id)).not.toContain('msg-07');
    expect(projectReplay('tl-18')!.messages.map(m => m.id)).toContain('msg-07');
    expect(projectReplay('tl-27')!.actors.map(a => a.id)).toContain('st-06');
    expect(projectReplay('not-a-stage')).toBeNull();
  });
  it('prevents direct URL access to future evidence without leaking its metadata', () => {
    expect(projectReplayEvidence('tl-17', 'D71')).toBeNull();
    expect(projectReplayEvidence('tl-17', 'D72')).toBeNull();
    expect(projectReplayEvidence('tl-17', 'msg-07')).toBeNull();
    expect(projectReplayEvidence('tl-21', 'D71')).toBeNull();
    expect(projectReplayEvidence('tl-22', 'D71')?.kind).toBe('document');
    expect(projectReplayEvidence('tl-28', 'D72')).toBeNull();
    expect(projectReplayEvidence('tl-29', 'D72')?.text).toContain('566');
    expect(projectReplayEvidence('tl-29', 'agency:/efile')).toBeNull();
    expect(projectReplayEvidence('tl-29', 'D72', 999)).toBeNull();
    expect(projectReplayEvidence('tl-29', 'D72', 1.5)).toBeNull();
  });
  it('keeps replay deterministic and leaves main clock and packet untouched when seeking backward', () => {
    const before = JSON.stringify(getPacket());
    const march = projectReplay('tl-04');
    projectReplay('tl-29');
    projectReplayEvidence('tl-29', 'D72');
    expect(projectReplay('tl-04')).toEqual(march);
    expect(JSON.stringify(getPacket())).toBe(before);
    expect(DEFAULT_AS_OF).toBe('2026-06-23T23:59:59.999Z');
    expect(documentAvailableAt(getPacket().documents.find(d => d.id === 'D71')!)).toBe(false);
  });
  it('retains the original v2 extension estimate after v3 becomes available', () => {
    expect(projectReplay('tl-08')?.extension).toBeNull();
    const extension = projectReplay('extension-2026-04-14')!.extension;
    expect(extension).toMatchObject({ based_on_version: 'v2', federal: { estimated_total_tax: 77470, estimated_balance: 35728, paid_with_form_4868: 36000 } });
    expect(projectReplay('tl-29')?.extension).toEqual(extension);
  });
  it('redacts restricted replay evidence for uncleared viewers and omits authorization PINs', () => {
    const evidence = projectReplayEvidence('tl-22', 'D71')!;
    const redacted = redact(evidence, 'st-04');
    expect(redacted.text).toContain('[restricted]');
    expect(redacted.text).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    const approval = projectReplay('tl-20')!.history.find(t => t.id === 'tl-20')!;
    expect(approval.detail).not.toContain('41207');
    expect(approval.detail).not.toContain('88310');
  });
});

describe('supplied single-alternative scenarios', () => {
  it('binds all five alternatives to original v3 and verifies their baseline', () => {
    const first = projectScenarios()!;
    expect(first.options).toHaveLength(5);
    for (const { id } of first.options) {
      const scenario = projectScenarios(id)!;
      expect(scenario.baselineMatches).toBe(true);
      expect(scenario.baseline.version).toBe('v3');
      expect(scenario.selected.base_version).toBe('v3');
      expect(scenario.appliedToWorkingReturn).toBe(false);
      expect(scenario.mode).toBe('supplied_single_alternative');
      for (const jurisdiction of ['federal', 'california'] as const) {
        const j = scenario.selected[jurisdiction];
        expect(j.alternative.total_tax - j.base.total_tax).toBe(j.total_tax_change);
      }
    }
    expect(projectScenarios('hvac_improvement')!.selected).toMatchObject({ federal: { total_tax_change: 3633 }, california: { total_tax_change: 896 } });
  });
  it('does not accept combined alternatives or infer annualization savings', () => {
    expect(projectScenarios('hvac_improvement,equipment_section179')).toBeNull();
    expect(projectScenarios('custom')).toBeNull();
    const annualized = projectScenarios('penalty_annualized')!.selected;
    expect(annualized.changed_lines).toEqual([]);
    expect(annualized.federal.alternative.penalty).toBe(164);
    expect(annualized.federal.penalty_change).toBe(0);
  });
});
