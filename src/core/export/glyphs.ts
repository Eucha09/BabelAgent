import { parseSmart, splitBranches, type SmartSyntax, type SmartToken } from '../qa/smart'
import { stripTags } from '../qa/tags'

/** 화면에 그려지는 리터럴. 플레이스홀더의 선택자·포매터 이름과 분기 구분자 `|` 는 빼고, 분기 안의 글자는 넣는다. */
function literalPieces(tokens: readonly SmartToken[], out: string[]): void {
  for (const token of tokens) {
    if (token.kind === 'literal') out.push(token.text)
    else if (token.body) for (const branch of splitBranches(token.body)) literalPieces(branch, out)
  }
}

/** 폰트 아틀라스에 필요 없는 제어 문자(C0·DEL·C1). 공백은 남긴다. */
const isControl = (codePoint: number): boolean => codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)

/**
 * 문자열들에 쓰인 글자를 모은다(폰트 아틀라스용). 코드 포인트 순, 중복 없음.
 * 변수 플레이스홀더와 리치 텍스트 태그는 화면에 그대로 나오지 않으므로 뺀다. 이스케이프는 푼 글자로 센다(`{{` → `{`).
 */
export function collectGlyphs(texts: Iterable<string>, syntax: SmartSyntax): string {
  const codePoints = new Set<number>()
  for (const text of texts) {
    if (text === '') continue
    const pieces: string[] = []
    literalPieces(parseSmart(text, syntax).tokens, pieces)
    // 조각 사이에 태그가 걸치지 않게 줄바꿈으로 이어 붙인 뒤 태그를 지운다(줄바꿈은 제어 문자라 빠진다)
    for (const char of stripTags(pieces.join('\n'))) {
      const codePoint = char.codePointAt(0)
      if (codePoint !== undefined && !isControl(codePoint)) codePoints.add(codePoint)
    }
  }
  return String.fromCodePoint(...[...codePoints].sort((a, b) => a - b))
}
