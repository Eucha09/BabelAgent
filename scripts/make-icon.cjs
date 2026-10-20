/**
 * build/icon.svg 에서 창·패키징용 래스터와 상단 바용 React 컴포넌트를 만든다.
 *   npm run icon
 *
 * 이미지 라이브러리를 따로 두지 않으려고 Electron 창에 SVG를 띄워 캡처한다.
 * ICO는 PNG를 그대로 품는 형식(Windows Vista 이상)이라 헤더 22바이트만 붙이면 된다.
 * 정규식을 쓰지 않는다 — 문자열 위치로만 자른다.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const TILE = 512
const GLYPH = 420
const TILE_BG = '#242424'
const GLYPH_COLOR = '#ececec'

const source = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')
const svgStart = source.indexOf('<svg')
const svgEnd = source.lastIndexOf('</svg>')
if (svgStart < 0 || svgEnd < 0) throw new Error('build/icon.svg 에서 <svg> 를 찾지 못했습니다.')

/** 주석을 뺀 <svg> ... </svg> 전체. */
const svgMarkup = source.slice(svgStart, svgEnd + '</svg>'.length)
/** <svg> 여는 태그 안쪽의 도형들만. */
const inner = svgMarkup
  .slice(svgMarkup.indexOf('>') + 1, svgMarkup.lastIndexOf('</svg>'))
  .trim()
  .split('\n')
  .map((line) => '      ' + line.trim())
  .join('\n')

const glyph = svgMarkup
  .replace('width="24" height="24"', 'width="' + GLYPH + '" height="' + GLYPH + '"')
  .replace('fill="currentColor"', 'fill="' + GLYPH_COLOR + '"')

const html =
  '<!doctype html><html><head><meta charset="utf-8"><style>' +
  'html,body{margin:0;width:' + TILE + 'px;height:' + TILE + 'px;background:transparent}' +
  '.tile{width:' + TILE + 'px;height:' + TILE + 'px;border-radius:96px;background:' + TILE_BG + ';' +
  'display:flex;align-items:center;justify-content:center}' +
  '</style></head><body><div class="tile">' + glyph + '</div></body></html>'

const component =
  '/** 바벨탑 아이콘. build/icon.svg 에서 생성된다 — 직접 고치지 말고 `npm run icon` 을 돌릴 것. */\n' +
  'export function AppIcon({ size = 16 }: { size?: number }): React.JSX.Element {\n' +
  '  return (\n' +
  '    <svg\n' +
  '      className="app-icon"\n' +
  '      width={size}\n' +
  '      height={size}\n' +
  '      viewBox="0 0 24 24"\n' +
  '      fill="currentColor"\n' +
  '      aria-hidden="true"\n' +
  '      focusable="false"\n' +
  '    >\n' +
  inner + '\n' +
  '    </svg>\n' +
  '  )\n' +
  '}\n'

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: TILE,
      height: TILE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      useContentSize: true
    })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((resolve) => setTimeout(resolve, 600))

    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(root, 'build', 'icon.png'), image.toPNG())

    const png = image.resize({ width: 256, height: 256 }).toPNG()
    const header = Buffer.alloc(22)
    header.writeUInt16LE(1, 2) // type: icon
    header.writeUInt16LE(1, 4) // count
    header.writeUInt16LE(1, 10) // planes
    header.writeUInt16LE(32, 12) // bit count
    header.writeUInt32LE(png.length, 14)
    header.writeUInt32LE(22, 18)
    fs.writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([header, png]))

    // 상단 바 아이콘이 원본과 갈라지지 않게 같은 도형에서 컴포넌트를 찍어낸다.
    fs.writeFileSync(path.join(root, 'src', 'renderer', 'components', 'AppIcon.tsx'), component)

    console.log('icon.png ' + TILE + 'px, icon.ico 256px, AppIcon.tsx 생성 완료')
  } catch (error) {
    console.error('아이콘 생성 실패:', error)
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
