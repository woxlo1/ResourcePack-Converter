const FORBIDDEN_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/;

/**
 * Returns true when the value contains ASCII control characters. Written as a
 * loop instead of a regular expression so the safety check is explicit.
 */
export function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Builds a filesystem-safe base name for generated ZIP and report files. */
export function sanitizeFileNameBase(value: string, fallback = 'resourcepack'): string {
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    result += code <= 0x1f || code === 0x7f || FORBIDDEN_FILE_NAME_CHARACTERS.test(character) ? '_' : character;
  }
  return result.trim() || fallback;
}
