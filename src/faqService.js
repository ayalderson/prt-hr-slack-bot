/**
 * FAQ Service — Airtable Edition (FIXED)
 * Handles Keywords as BOTH string and array (Airtable multi-select safe)
 */

const https = require('https');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_FAQ_TABLE = process.env.AIRTABLE_FAQ_TABLE || 'FAQs';

// Cache FAQs for 10 minutes
const faqCache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Normalize keywords (handles string OR array)
 */
function normalizeKeywords(raw) {
  if (!raw) return [];

  // Airtable multi-select → array
  if (Array.isArray(raw)) {
    return raw.map(k => String(k).toLowerCase().trim());
  }

  // Text field → comma-separated string
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

/**
 * Fetch all FAQ records from Airtable
 */
function fetchFAQs() {
  return new Promise((resolve, reject) => {
    if (faqCache.data && Date.now() - faqCache.timestamp < CACHE_TTL_MS) {
      return resolve(faqCache.data);
    }

    if (!AIRTABLE_API_KEY) {
      return reject(new Error("Missing AIRTABLE_API_KEY"));
    }

    const path = `/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_FAQ_TABLE)}`;

    const options = {
      hostname: 'api.airtable.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`
      }
    };

    https.get(options, (res) => {
      let body = '';

      res.on('data', chunk => body += chunk);

      res.on('end', () => {
        try {
          // Debug (remove later if needed)
          // console.log("Airtable response:", body);

          const json = JSON.parse(body);

          if (json.error) {
            return reject(new Error(json.error.message));
          }

          const records = (json.records || []).map(r => ({
            id: r.id,
            question: r.fields['Question'] || r.fields['question'] || '',
            answer: r.fields['Answer'] || r.fields['answer'] || '',
            keywords: normalizeKeywords(
              r.fields['Keywords'] || r.fields['keywords']
            )
          }));

          faqCache.data = records;
          faqCache.timestamp = Date.now();

          resolve(records);

        } catch (e) {
          reject(e);
        }
      });

    }).on('error', reject);
  });
}

/**
 * Find the best matching FAQ
 */
async function findAnswer(userQuery) {
  const faqs = await fetchFAQs();

  const query = userQuery.toLowerCase();
  const queryWords = query.split(/\s+/).filter(w => w.length > 2);

  let bestMatch = null;
  let bestScore = 0;

  for (const faq of faqs) {
    let score = 0;

    // Keyword match (strong weight)
    for (const keyword of faq.keywords) {
      if (query.includes(keyword) || keyword.includes(query)) {
        score += 2;
      }
    }

    // Question word overlap
    const questionWords = faq.question.toLowerCase().split(/\s+/);

    for (const word of queryWords) {
      if (questionWords.includes(word)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

/**
 * Get all FAQs
 */
async function getAllFAQs() {
  return await fetchFAQs();
}

/**
 * Clear cache manually
 */
function clearFAQCache() {
  faqCache.data = null;
  faqCache.timestamp = 0;
}

module.exports = { findAnswer, getAllFAQs, clearFAQCache };