/**
 * Timestamp helpers shared by main-process jobs and messaging.
 * Behavior matches the previous getNow / generateRandomString in main.js.
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

function generateRandomString(length) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

module.exports = { getNow, generateRandomString };
