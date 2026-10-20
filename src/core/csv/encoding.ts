/** UTF-8 디코딩에 실패하면 나타나는 치환 문자. */
const REPLACEMENT = '�'

/**
 * UTF-8로 읽은 결과가 깨졌는지 본다.
 * 치환 문자가 하나라도 있으면 다른 인코딩(CP949)으로 다시 읽어야 한다는 뜻이다.
 */
export function looksMisdecoded(text: string): boolean {
  return text.includes(REPLACEMENT)
}

/** UTF-8 BOM을 떼어낸다. 저장할 때는 BOM을 붙이지 않는다. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
