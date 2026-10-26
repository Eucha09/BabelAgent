import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { cancelLogin } from './agent/auth'
import { registerIpc } from './ipc'

const devUrl = process.env['ELECTRON_RENDERER_URL']

/**
 * 창 크롬 색. CSS 변수를 쓸 수 없는 유일한 자리이므로
 * tokens.css의 --bg-panel / --text-secondary 와 값을 맞춰 둔다.
 */
const CHROME_BG = '#181818'
const CHROME_SYMBOL = '#b8b8b8'
const TITLEBAR_HEIGHT = 36

/** 창과 작업 표시줄 아이콘. 개발·패키징 모두 같은 상대 경로로 읽힌다. */
const ICON_PATH = join(__dirname, '../../build/icon.png')

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Babel Agent',
    icon: ICON_PATH,
    backgroundColor: CHROME_BG,
    autoHideMenuBar: true,
    // 기본 제목 표시줄 대신 앱이 그리는 상단 바를 쓴다. 창 버튼은 OS가 어두운 색으로 그린다.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarOverlay: {
            color: CHROME_BG,
            symbolColor: CHROME_SYMBOL,
            height: TITLEBAR_HEIGHT
          }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 렌더러는 preload가 노출한 IPC로만 메인과 통신한다
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // 새 창과 외부 링크는 기본 브라우저로 넘긴다
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 앱 외부로의 이동을 막는다
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 앱을 닫을 때 진행 중인 로그인 프로세스를 남기지 않는다
app.on('before-quit', () => {
  cancelLogin()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
