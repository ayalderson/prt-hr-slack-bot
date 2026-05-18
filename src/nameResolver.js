/**
 * Name Resolver
 * Matches a Slack user's real_name against employee names in the leave sheet.
 * Handles partial matches (first name only, last name only, full name).
 */

/**
 * Get a Slack user's real name from their user ID
 */
async function getSlackRealName(client, userId) {
  const info = await client.users.info({ user: userId });
  return info.user?.profile?.real_name || info.user?.real_name || null;
}

/**
 * Find the best matching employee name from the sheet
 * given a Slack display name.
 *
 * Matching priority:
 * 1. Exact match (case-insensitive)
 * 2. All words in Slack name appear in sheet name
 * 3. Any word in Slack name matches any word in sheet name (partial)
 *
 * Returns { slackName, matchedName, confidence } or null
 */
async function resolveEmployeeName(client, userId, getAllEmployeeNames) {
  const slackName = await getSlackRealName(client, userId);
  if (!slackName) return null;

  const allNames = await getAllEmployeeNames();
  const slackLower = slackName.toLowerCase().trim();
  const slackWords = slackLower.split(/\s+/);

  let bestMatch = null;
  let bestScore = 0;

  for (const sheetName of allNames) {
    const sheetLower = sheetName.toLowerCase().trim();
    const sheetWords = sheetLower.split(/\s+/);
    let score = 0;

    // 1. Exact match
    if (slackLower === sheetLower) {
      score = 100;
    } else {
      // 2. All Slack words found in sheet name
      const allFound = slackWords.every(w => sheetWords.includes(w));
      if (allFound) score = 80;
      else {
        // 3. Partial — count how many words overlap
        const overlap = slackWords.filter(w => sheetWords.includes(w)).length;
        score = overlap * 30;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = sheetName;
    }
  }

  // Only return if confidence is reasonable (at least one word matched)
  if (bestScore >= 30) {
    return {
      slackName,
      matchedName: bestMatch,
      confidence: bestScore >= 80 ? 'high' : 'partial'
    };
  }

  return { slackName, matchedName: null, confidence: 'none' };
}

module.exports = { getSlackRealName, resolveEmployeeName };
