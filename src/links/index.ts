import type { Board, CompleteItem, ItemId } from '../domain/types';
import { extractKeywords, type Keyword } from './keywords';
import type { LinkKeyword } from './match';

interface Entry {
  readonly keyword: Keyword;
  readonly item: CompleteItem;
}

/** The keywords of all Complete topics, grouped by comparison key. */
export interface KeywordIndex {
  readonly byKey: ReadonlyMap<string, readonly Entry[]>;
}

export function buildKeywordIndex(board: Board): KeywordIndex {
  const byKey = new Map<string, Entry[]>();
  for (const item of board.complete) {
    for (const keyword of extractKeywords(item.headline)) {
      const entries = byKey.get(keyword.key);
      if (entries === undefined) byKey.set(keyword.key, [{ keyword, item }]);
      else entries.push({ keyword, item });
    }
  }
  return { byKey };
}

/**
 * The keywords that can be linked in the description of the topic `sourceId`. A keyword that two
 * topics give is not linked anywhere. The topic's own keywords are not linked in its description.
 */
export function linkKeywordsFor(index: KeywordIndex, sourceId: ItemId): LinkKeyword[] {
  const result: LinkKeyword[] = [];
  for (const entries of index.byKey.values()) {
    const [only, ...others] = entries;
    if (only === undefined || others.length > 0 || only.item.id === sourceId) continue;
    result.push({ keyword: only.keyword, targetId: only.item.id, targetHeadline: only.item.headline });
  }
  return result;
}

export interface KeywordStatus {
  readonly keyword: Keyword;
  /** The headlines of the other Complete topics that give the same keyword. */
  readonly alsoUsedBy: readonly string[];
}

/** The keywords of a (draft) headline of the topic `itemId`, each with its collisions. */
export function keywordStatuses(index: KeywordIndex, headline: string, itemId: ItemId): KeywordStatus[] {
  return extractKeywords(headline).map((keyword) => ({
    keyword,
    alsoUsedBy: (index.byKey.get(keyword.key) ?? [])
      .filter((entry) => entry.item.id !== itemId)
      .map((entry) => entry.item.headline),
  }));
}
