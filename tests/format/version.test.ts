import { describe, expect, it } from 'vitest';
import { describeVersionError, detectVersion, versionLine } from '../../src/format/version';

const OLD = '<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->';

describe('detectVersion', () => {
  it.each([
    ['the v1 header', `# Learning\n\n${OLD}\n\n## New\n`, 1],
    ['the v1 header with \\r\\n', `# Learning\r\n\r\n${OLD}\r\n\r\n## New\r\n`, 1],
    ['the v1 header with extra blank lines', `# Learning\n\n\n\n${OLD}\n`, 1],
    ['version 2', '<!-- version:2 -->\n\n# Learning\n', 2],
    ['version 39', '<!-- version:39 -->\n', 39],
    ['version 2 with \\r\\n', '<!-- version:2 -->\r\n\r\n# Learning\r\n', 2],
    ['an empty text', '', 0],
    ['only whitespace', ' \r\n\n\t\n', 0],
  ])('%s', (_name, text, version) => {
    expect(detectVersion(text)).toEqual({ ok: true, value: version });
  });

  it.each([
    ['text without a marker', '# Learning\n\n## New\n'],
    ['a version line on line 2', '\n<!-- version:2 -->\n'],
    ['a version line below other text', 'hello\n<!-- version:2 -->\n'],
    ['a BOM before the marker', '﻿<!-- version:2 -->\n'],
    ['only a BOM', '﻿'],
    ['the v1 title without the comment', '# Learning\n\n## New\n\n<!-- learning-tracker -->\n'],
  ])('reports NoVersionMarker for %s', (_name, text) => {
    expect(detectVersion(text)).toEqual({ ok: false, error: { type: 'NoVersionMarker' } });
  });

  it.each([
    ['a leading zero', '<!-- version:02 -->'],
    ['no number', '<!-- version: -->'],
    ['a negative number', '<!-- version:-1 -->'],
    ['a letter', '<!-- version:x -->'],
    ['version 0', '<!-- version:0 -->'],
    ['version 1', '<!-- version:1 -->'],
    ['no spaces', '<!--version:2-->'],
    ['a space at the end', '<!-- version:2 --> '],
    ['an unsafe integer', '<!-- version:9007199254740993 -->'],
  ])('reports InvalidVersionMarker on line 1 for %s', (_name, line) => {
    expect(detectVersion(`${line}\n\n# Learning\n`)).toEqual({
      ok: false,
      error: { type: 'InvalidVersionMarker', line: 1, found: line },
    });
  });

  it.each([
    ['v2', OLD.replace('v1', 'v2')],
    ['vX', OLD.replace('v1', 'vX')],
    ['v10', OLD.replace('v1 —', 'v10 —')],
  ])('reports InvalidVersionMarker for the old comment with %s', (_name, comment) => {
    expect(detectVersion(`# Learning\n\n${comment}\n`)).toEqual({
      ok: false,
      error: { type: 'InvalidVersionMarker', line: 3, found: comment },
    });
  });

  it('ignores a version line inside a description', () => {
    const text = '# Learning\n\n<!-- desc -->\n<!-- version:5 -->\n';
    expect(detectVersion(text)).toEqual({ ok: false, error: { type: 'NoVersionMarker' } });
  });
});

describe('versionLine and describeVersionError', () => {
  it('writes the marker', () => {
    expect(versionLine(7)).toBe('<!-- version:7 -->');
  });

  it('describes both errors', () => {
    expect(describeVersionError({ type: 'NoVersionMarker' })).toContain('has no version line');
    expect(describeVersionError({ type: 'InvalidVersionMarker', line: 1, found: 'x' })).toBe(
      'Line 1 of learning.md is not a valid version line: x',
    );
  });
});
