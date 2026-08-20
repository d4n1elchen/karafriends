// YouTube uses BCP-47-like language tags such as ja, zh-TW, zh-Hant, and
// en-US. Keep this deliberately narrower than yt-dlp's subtitle selector
// syntax so values cannot contain wildcards, exclusions, or path characters.
const youtubeCaptionCodeRe = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isValidYoutubeCaptionCode(code: string): boolean {
  return youtubeCaptionCodeRe.test(code);
}
