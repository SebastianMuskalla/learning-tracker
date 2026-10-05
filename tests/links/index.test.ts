import { describe, expect, it } from 'vitest';
import { buildKeywordIndex, keywordStatuses, linkKeywordsFor } from '../../src/links/index';
import { BoardBuilder } from './boardBuilder';

function linked(builder: BoardBuilder, source: string): string[] {
  return linkKeywordsFor(buildKeywordIndex(builder.board), builder.id(source))
    .map((k) => `${k.keyword.text} → ${k.targetHeadline}`)
    .sort();
}

describe('linkKeywordsFor', () => {
  it('links only to Complete topics', () => {
    const builder = new BoardBuilder()
      .add('OWASP')
      .add('Docker', 'wip')
      .add('Kubernetes', 'new')
      .add('Terraform', 'discarded')
      .add('Source', 'wip');
    expect(linked(builder, 'Source')).toEqual(['OWASP → OWASP']);
  });

  it('does not link a topic to itself', () => {
    const builder = new BoardBuilder().add('OWASP').add('XSS, CSRF');
    expect(linked(builder, 'OWASP')).toEqual(['CSRF → XSS, CSRF', 'XSS → XSS, CSRF']);
  });

  it('does not link a keyword that two topics give, also not in their own descriptions', () => {
    const builder = new BoardBuilder()
      .add('Risk assessment')
      .add('risk-Assessment (other)')
      .add('RISKASSESSMENT, Other')
      .add('Source', 'wip');
    expect(linked(builder, 'Source')).toEqual(['Other → RISKASSESSMENT, Other']);
    expect(linked(builder, 'Risk assessment')).toEqual(['Other → RISKASSESSMENT, Other']);
  });

  it('does not treat Risk and Risks as a collision', () => {
    const builder = new BoardBuilder().add('Risk').add('Risks').add('Source', 'wip');
    expect(linked(builder, 'Source')).toEqual(['Risk → Risk', 'Risks → Risks']);
  });
});

describe('keywordStatuses', () => {
  it('reports the other Complete topics that give the same keyword', () => {
    const builder = new BoardBuilder().add('OWASP (one)').add('owasp (two)').add('Draft', 'wip');
    const index = buildKeywordIndex(builder.board);
    const statuses = keywordStatuses(index, 'OWASP, XSS', builder.id('Draft'));
    expect(statuses.map((s) => [s.keyword.text, [...s.alsoUsedBy].sort()])).toEqual([
      ['OWASP', ['OWASP (one)', 'owasp (two)']],
      ['XSS', []],
    ]);
  });

  it('does not report the topic itself', () => {
    const builder = new BoardBuilder().add('OWASP').add('OWASP (again)', 'wip');
    const index = buildKeywordIndex(builder.board);
    expect(keywordStatuses(index, 'OWASP', builder.id('OWASP'))[0]?.alsoUsedBy).toEqual([]);
    expect(keywordStatuses(index, 'OWASP (again)', builder.id('OWASP (again)'))[0]?.alsoUsedBy).toEqual([
      'OWASP',
    ]);
  });

  it('is empty for a headline without keywords', () => {
    const builder = new BoardBuilder().add('OWASP');
    expect(keywordStatuses(buildKeywordIndex(builder.board), '(x)', builder.id('OWASP'))).toEqual([]);
  });
});
