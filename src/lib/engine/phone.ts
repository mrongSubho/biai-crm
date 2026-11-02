/**
 * Bangladesh E.164 Phone Normalization & Validation Engine
 * 
 * Valid operator prefixes in Bangladesh:
 * 013 (Grameenphone 4G), 017 (Grameenphone)
 * 014 (Banglalink 4G), 019 (Banglalink)
 * 015 (Teletalk)
 * 016 (Airtel), 018 (Robi)
 */

export interface PhoneNormalizationResult {
  isValid: boolean;
  raw: string;
  normalized: string | null;
  operator: string | null;
  error?: string;
}

const OPERATOR_PREFIX_MAP: Record<string, string> = {
  '13': 'Grameenphone',
  '17': 'Grameenphone',
  '14': 'Banglalink',
  '19': 'Banglalink',
  '15': 'Teletalk',
  '16': 'Airtel',
  '18': 'Robi',
};

export function normalizeBangladeshPhone(rawPhone: string | null | undefined): PhoneNormalizationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      raw: rawPhone || '',
      normalized: null,
      operator: null,
      error: 'PHONE_EMPTY'
    };
  }

  const trimmed = rawPhone.trim();
  // Strip out spaces, dashes, dots, parentheses
  const digitsOnly = trimmed.replace(/[^\d+]/g, '');

  let cleanDigits = digitsOnly;
  if (cleanDigits.startsWith('+')) {
    cleanDigits = cleanDigits.substring(1);
  }

  // Handle standard BD prefixes:
  // 88017XXXXXXXX -> 017XXXXXXXX
  // +88017XXXXXXXX -> 017XXXXXXXX
  if (cleanDigits.startsWith('880')) {
    cleanDigits = cleanDigits.substring(3);
  } else if (cleanDigits.startsWith('0')) {
    cleanDigits = cleanDigits.substring(1);
  }

  // Now cleanDigits should be exactly 10 digits starting with 1[3-9]
  // e.g. "1711000001"
  if (cleanDigits.length !== 10) {
    return {
      isValid: false,
      raw: rawPhone,
      normalized: null,
      operator: null,
      error: `INVALID_LENGTH: Expected 10 digits after prefix, got ${cleanDigits.length}`
    };
  }

  const prefix = cleanDigits.substring(0, 2);
  const operator = OPERATOR_PREFIX_MAP[prefix];

  if (!operator) {
    return {
      isValid: false,
      raw: rawPhone,
      normalized: null,
      operator: null,
      error: `UNKNOWN_BD_OPERATOR_PREFIX: 0${prefix}`
    };
  }

  // Canonical E.164 format: +8801XXXXXXXXX
  const canonical = `+880${cleanDigits}`;

  return {
    isValid: true,
    raw: rawPhone,
    normalized: canonical,
    operator,
  };
}

/**
 * Extracts phone numbers embedded directly inside raw text messages
 */
export function extractPhoneFromText(text: string): string | null {
  if (!text) return null;
  // Match potential BD phone patterns in text
  const bdPhoneRegex = /(?:\+?880|0)?1[3-9]\d{2}[-\s]?\d{3}[-\s]?\d{3}/;
  const match = text.match(bdPhoneRegex);
  if (match) {
    const res = normalizeBangladeshPhone(match[0]);
    if (res.isValid && res.normalized) {
      return res.normalized;
    }
  }
  return null;
}
