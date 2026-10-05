import { describe, expect, it } from 'vitest';
import { comparisonKey, extractKeywords, titleCase } from '../../src/links/keywords';

function texts(headline: string): string[] {
  return extractKeywords(headline).map((keyword) => keyword.text);
}

function caseMode(headline: string): string | undefined {
  return extractKeywords(headline)[0]?.caseMode;
}

describe('extractKeywords', () => {
  it.each([
    ['OWASP (Open Worldwide Application Security Project)', ['OWASP']],
    ['CI/CD', ['CI/CD']],
    ['Risk: Risk assessment, Risk handling', ['Risk']],
    ['CI, CD', ['CI', 'CD']],
    ['C#, C++, .NET', ['C#', 'C++', '.NET']],
    ['C, R', []],
    ['++', []],
    ['Risk assessment, Risk-assessment', ['Risk assessment']],
    ['Risk assessment, Risk handling', ['Risk assessment', 'Risk handling']],
    ['Risk assessment; Risk handling', ['Risk assessment', 'Risk handling']],
    ['XSS (Cross-site scripting), CSRF (Cross-site request forgery)', ['XSS', 'CSRF']],
    ['OWASP (Note: see below)', ['OWASP']],
    ['std::vector', ['std::vector']],
    ['Foo (bar', []],
    ['(Only text in parentheses)', []],
    ['Docker, docker', ['Docker']],
  ])('%s', (headline, expected) => {
    expect(texts(headline)).toEqual(expected);
  });

  it('removes nested groups from the inside out', () => {
    expect(texts('OWASP (Open Worldwide (Web) Project)')).toEqual(['OWASP']);
  });

  it('cuts at a colon at the end', () => {
    expect(texts('Risk:')).toEqual(['Risk']);
  });

  it('cleans whitespace', () => {
    expect(texts('  Risk    assessment  ,  Foo ')).toEqual(['Risk assessment', 'Foo']);
  });

  it('accepts Unicode letters', () => {
    expect(texts('Übung, 日本語')).toEqual(['Übung', '日本語']);
  });

  it('counts characters, not whitespace, for the minimum length', () => {
    expect(texts('A B')).toEqual(['A B']);
    expect(caseMode('A B')).toBe('exact');
  });
});

describe('case modes', () => {
  it.each([
    ['OWASP', 'acronym'],
    ['CI/CD', 'acronym'],
    ['GitHub', 'acronym'],
    ['iOS', 'acronym'],
    ['OAuth', 'acronym'],
    ['.NET', 'acronym'],
    ['Risk assessment', 'any'],
    ['Docker', 'any'],
    ['X-Ray', 'any'],
    ['AI', 'exact'],
    ['S3', 'exact'],
    ['C#', 'exact'],
    ['Go', 'exact'],
  ])('%s is %s', (headline, expected) => {
    expect(caseMode(headline)).toBe(expected);
  });
});

describe('comparisonKey', () => {
  it('ignores case, whitespace, and hyphens', () => {
    expect(comparisonKey('Risk assessment')).toBe('riskassessment');
    expect(comparisonKey('Risk-assessment')).toBe('riskassessment');
    expect(comparisonKey('RISKASSESSMENT')).toBe('riskassessment');
  });

  it('keeps other characters', () => {
    expect(comparisonKey('CI/CD')).toBe('ci/cd');
  });
});

describe('titleCase', () => {
  it('upper-cases the first letter and lower-cases the rest', () => {
    expect(titleCase('OWASP')).toBe('Owasp');
    expect(titleCase('CI/CD')).toBe('Ci/cd');
    expect(titleCase('.NET')).toBe('.Net');
    expect(titleCase('++')).toBe('++');
  });
});
