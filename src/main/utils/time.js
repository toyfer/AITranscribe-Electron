const crypto = require("crypto");

/**
 * Timestamp helpers shared by main-process jobs and messaging.
 * Behavior matches the previous getNow / generateRandomString in main.js.
 *
 * NOTE: generateRandomString now uses crypto.randomBytes (cryptographically
 * strong) instead of Math.random(), per security review recommendation.
 */

function getNow(pathFlag = false) {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();

  if (!pathFlag) {
    return `${year}/${month}/${date}_${hour}:${min}:${sec}`;
  }
  return `${year}-${month}-${date}_${hour}-${min}-${sec}`;
}

/**
 * Generate a cryptographically random alphanumeric string.
 * Uses Node.js crypto.randomBytes (not Math.random) per security review.
 * @param {number} length - Desired output length
 * @returns {string}
 */
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

module.exports = { getNow, generateRandomString };
