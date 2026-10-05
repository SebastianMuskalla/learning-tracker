import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../src/domain/types';
import { extractKeywords } from '../../src/links/keywords';
import { findKeywordHits, type LinkKeyword } from '../../src/links/match';

/** One target per headline. The target id is the headline. */
function targets(...headlines: string[]): LinkKeyword[] {
  return headlines.flatMap((headline) =>
    extractKeywords(headline).map((keyword) => ({
      keyword,
      targetId: headline as ItemId,
      targetHeadline: headline,
    })),
  );
}

/** The matched texts. */
function hits(text: string, ...headlines: string[]): string[] {
  return findKeywordHits(text, targets(...headlines)).map((hit) => text.slice(hit.start, hit.end));
}

describe('findKeywordHits: boundaries', () => {
  it.each([
    ['CI/CD pipeline', 'CI/CD'],
    ['(CI/CD)', 'CI/CD'],
    ['OWASP-based', 'OWASP'],
    ["OWASP's list", 'OWASP'],
    ['OWASP’s list', 'OWASP'],
    ['pre-OWASP-era', 'OWASP'],
    ['_OWASP_', 'OWASP'],
  ])('matches in "%s"', (text, expected) => {
    expect(hits(text, 'OWASP', 'CI/CD')).toEqual([expected]);
  });

  it.each(['OWASPX', 'XOWASP', '1OWASP', 'OWASP2'])('does not match in "%s"', (text) => {
    expect(hits(text, 'OWASP')).toEqual([]);
  });

  it('does not match C# in "C#5"', () => {
    expect(hits('C#5 and C#', 'C#')).toEqual(['C#']);
  });

  it('does not use letters of other scripts as a boundary', () => {
    expect(hits('ÜOWASP', 'OWASP')).toEqual([]);
  });
});

describe('findKeywordHits: case', () => {
  it('matches an acronym exactly and in Title case only', () => {
    expect(hits('OWASP Owasp owasp OwASP', 'OWASP')).toEqual(['OWASP', 'Owasp']);
    expect(hits('CI/CD Ci/cd ci/cd', 'CI/CD')).toEqual(['CI/CD', 'Ci/cd']);
  });

  it('matches other keywords in any case', () => {
    expect(hits('risk assessment, Risk Assessment, RISK ASSESSMENT', 'Risk assessment')).toEqual([
      'risk assessment',
      'Risk Assessment',
      'RISK ASSESSMENT',
    ]);
  });

  it('matches a 2-character keyword only exactly', () => {
    expect(hits('It is IT, it', 'IT')).toEqual(['IT']);
    expect(hits('go Go GO goes', 'Go')).toEqual(['Go']);
  });
});

describe('findKeywordHits: separators', () => {
  it('matches whitespace, a line break, one hyphen, or nothing', () => {
    expect(
      hits(
        'risk assessment; Risk-assessment; Riskassessment; RiskAssessment; risk  \n assessment',
        'Risk assessment',
      ),
    ).toEqual([
      'risk assessment',
      'Risk-assessment',
      'Riskassessment',
      'RiskAssessment',
      'risk  \n assessment',
    ]);
  });

  it('treats a hyphen in the keyword the same way', () => {
    expect(hits('X-Ray, X Ray, XRay, XRAY', 'X-Ray')).toEqual(['X-Ray', 'X Ray', 'XRay', 'XRAY']);
  });

  it('does not match two hyphens', () => {
    expect(hits('risk--assessment', 'Risk assessment')).toEqual([]);
  });

  it('does not treat other characters as separators', () => {
    expect(hits('CI CD, CI-CD', 'CI/CD')).toEqual([]);
  });

  it('does not make a separator optional that is only in the text', () => {
    expect(hits('X-Ray', 'XRay')).toEqual([]);
  });
});

describe('findKeywordHits: plurals', () => {
  it('matches a lower-case s or es', () => {
    expect(hits('APIs and buses', 'API', 'Bus')).toEqual(['APIs', 'buses']);
    expect(hits('Risk assessments', 'Risk assessment')).toEqual(['Risk assessments']);
  });

  it('does not match an upper-case suffix or another letter', () => {
    expect(hits('APIS', 'API')).toEqual([]);
    expect(hits('OWASPx', 'OWASP')).toEqual([]);
    expect(hits('APIsx', 'API')).toEqual([]);
  });

  it('allows a plural of a 2-character keyword', () => {
    expect(hits('CDs', 'CD')).toEqual(['CDs']);
  });

  it('reports the plural', () => {
    const [hit] = findKeywordHits('APIs', targets('API'));
    expect(hit?.plural).toBe(true);
  });
});

describe('findKeywordHits: overlaps', () => {
  it('lets the longest match win', () => {
    const found = findKeywordHits('a risk assessment', targets('Risk', 'Risk assessment, Risk handling'));
    expect(found.map((hit) => hit.target.targetId)).toEqual(['Risk assessment, Risk handling']);
  });

  it('prefers a match without a plural suffix', () => {
    const found = findKeywordHits('Risks', targets('Risk', 'Risks'));
    expect(found.map((hit) => hit.target.targetId)).toEqual(['Risks']);
  });

  it('lets the earlier match win at the same length', () => {
    expect(hits('ab cd ef', 'ab cd', 'cd ef')).toEqual(['ab cd']);
  });

  it('continues after the end of the accepted match', () => {
    expect(hits('Risk assessment and risk', 'Risk', 'Risk assessment')).toEqual(['Risk assessment', 'risk']);
  });
});

describe('findKeywordHits: other', () => {
  it('matches regex characters as plain text', () => {
    expect(hits('C++, C#, .NET, CXX', 'C++', 'C#', '.NET')).toEqual(['C++', 'C#', '.NET']);
    expect(hits('a.b a+b', 'a.b')).toEqual(['a.b']);
  });

  it('finds every occurrence', () => {
    expect(hits('OWASP and OWASP', 'OWASP')).toEqual(['OWASP', 'OWASP']);
  });

  it('finds a match that starts inside a failed match', () => {
    expect(hits('C++C++ C++', 'C++')).toEqual(['C++', 'C++']);
  });

  it('keeps a hyphen at the edge of a keyword exact', () => {
    expect(hits('use -flag and flag', '-flag')).toEqual(['-flag']);
  });
});
