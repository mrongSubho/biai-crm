import type { Language } from '../types/crm.ts';

export interface DialectClassificationResult {
  language: Language;
  confidence: number;
  bnScriptRatio: number;
  banglishScore: number;
  englishScore: number;
  matchedTokens: string[];
}

/**
 * Common Banglish phonetic morphemes, verbs, pronouns, and markers.
 * Lowercased and tokenized for robust matching.
 */
const BANGLISH_LEXICON = new Set([
  'assalamualaikum', 'walaikum', 'apnader', 'apnar', 'apnake', 'koto', 'kibhabe', 
  'korbo', 'korle', 'kora', 'korche', 'kori', 'gula', 'gulo', 'naki', 'pawa', 
  'jay', 'pabo', 'kothay', 'hobe', 'bolen', 'ta', 'ki', 'mane', 'vai', 'bhai',
  'apu', 'shuru', 'amader', 'amake', 'ami', 'taka', 'korte', 'chai', 'parbo',
  'hoy', 'achhe', 'ache', 'ei', 'oita', 'shesh', 'shob', 'notun', 'khub', 
  'shohoj', 'shohojei', 'pathabo', 'pathaben', 'shathe', 'ekhane', 'bikashe',
  'bkash', 'nagad', 'ashche', 'shukrobar', 'sombar', 'batch', 'dite', 'dibo',
  'deya', 'jabe'
]);

export function detectDialect(text: string): DialectClassificationResult {
  if (!text || !text.trim()) {
    return {
      language: 'UNKNOWN',
      confidence: 0,
      bnScriptRatio: 0,
      banglishScore: 0,
      englishScore: 0,
      matchedTokens: []
    };
  }

  const raw = text.trim();
  const totalChars = raw.replace(/\s+/g, '').length;
  if (totalChars === 0) {
    return {
      language: 'UNKNOWN',
      confidence: 0,
      bnScriptRatio: 0,
      banglishScore: 0,
      englishScore: 0,
      matchedTokens: []
    };
  }

  // 1. Check Bengali Unicode block (\u0980-\u09FF)
  const bnMatches = raw.match(/[\u0980-\u09FF]/g);
  const bnCount = bnMatches ? bnMatches.length : 0;
  const bnScriptRatio = bnCount / totalChars;

  // If >25% of characters are Bengali Unicode, it's definitively Bengali Script
  if (bnScriptRatio >= 0.25) {
    // If it also contains significant Latin words, could be mixed
    const latinMatches = raw.match(/[a-zA-Z]/g);
    const latinCount = latinMatches ? latinMatches.length : 0;
    const latinRatio = latinCount / totalChars;

    if (latinRatio > 0.35) {
      return {
        language: 'MIXED',
        confidence: 0.85,
        bnScriptRatio,
        banglishScore: 0,
        englishScore: latinRatio,
        matchedTokens: []
      };
    }

    return {
      language: 'BN_SCRIPT',
      confidence: Math.min(1.0, 0.7 + bnScriptRatio * 0.3),
      bnScriptRatio,
      banglishScore: 0,
      englishScore: 0,
      matchedTokens: []
    };
  }

  // 2. Tokenize Latin text and match against Banglish lexicon vs English
  const tokens = raw
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);

  if (tokens.length === 0) {
    return {
      language: 'UNKNOWN',
      confidence: 0.5,
      bnScriptRatio,
      banglishScore: 0,
      englishScore: 0,
      matchedTokens: []
    };
  }

  const matchedTokens: string[] = [];
  let banglishCount = 0;

  for (const token of tokens) {
    if (BANGLISH_LEXICON.has(token)) {
      banglishCount++;
      matchedTokens.push(token);
    }
  }

  const banglishScore = banglishCount / tokens.length;

  // If at least 2 Banglish markers found, or >15% of tokens are Banglish
  if (banglishCount >= 2 || (tokens.length <= 4 && banglishCount >= 1) || banglishScore >= 0.15) {
    const confidence = Math.min(0.99, 0.65 + Math.min(banglishCount * 0.1, 0.34));
    return {
      language: 'BANGLISH',
      confidence,
      bnScriptRatio,
      banglishScore,
      englishScore: 1 - banglishScore,
      matchedTokens
    };
  }

  // 3. Otherwise classify as English
  return {
    language: 'EN',
    confidence: 0.95,
    bnScriptRatio,
    banglishScore,
    englishScore: 1.0,
    matchedTokens: []
  };
}
