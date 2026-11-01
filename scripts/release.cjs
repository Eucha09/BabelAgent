// 릴리스: 새 버전을 받아 검사·테스트한 뒤 버전 커밋과 태그를 만들고 origin 에 올린다.
// 태그가 올라가면 GitHub Actions(.github/workflows/release.yml)가 설치 파일을 빌드해 Releases 에 바로 공개한다.
// 실행: release.bat [버전] 또는 npm run release -- [버전]. 버전을 비우면 묻는다.
'use strict'

const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const readline = require('node:readline/promises')

const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function fail(message) {
  console.error(`\n[중단] ${message}`)
  process.exit(1)
}

/** git 을 돌려 출력을 돌려준다. allowFail 이 아니면 실패할 때 중단한다 */
function git(args, allowFail = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0 && !allowFail) fail(`git ${args.join(' ')} 실패\n${(result.stderr ?? '').trim()}`)
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() }
}

/** npm 명령. 셸을 거치지 않도록 npm run 이 넘겨 준 npm-cli.js 를 지금 node 로 돌린다 */
function npm(args) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) fail(`npm ${args.join(' ')} 실패. 위 출력을 확인하세요.`)
}

/** 한 줄을 묻는다. 입력이 닫히면 빈 문자열 — 확인 질문에서는 '아니오'가 된다 */
let inputEnded = false

async function ask(question) {
  // 한 번 끝난 입력은 다시 close 를 알리지 않으므로 바로 빈 답으로 돌려준다
  if (inputEnded) {
    process.stdout.write(`${question}\n`)
    return ''
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  // 입력이 끝나면 question 은 끝나지 않은 채 프로세스가 0 으로 끝나 버리므로 close 를 따로 기다린다
  const closed = new Promise((resolve) => rl.once('close', () => resolve(null)))
  try {
    const answer = await Promise.race([rl.question(question), closed])
    if (answer === null) {
      inputEnded = true
      process.stdout.write('\n')
    }
    return answer ?? ''
  } catch {
    return ''
  } finally {
    rl.close()
  }
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

function parseVersion(text) {
  const match = SEMVER.exec(text)
  return match ? match.slice(1).map(Number) : null
}

function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

/** package.json 의 repository 에서 owner/repo 를 뽑는다 */
function repoSlug() {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url ?? '')
  return match ? match[1] : null
}

/** 저장소가 공개인지. 비공개 릴리스는 사용자가 받을 수 없고 앱도 업데이트를 확인하지 못한다 */
async function visibility(slug) {
  try {
    const response = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: { 'user-agent': 'babel-agent-release' },
      signal: AbortSignal.timeout(10_000)
    })
    if (response.status === 404) return 'private'
    if (!response.ok) return 'unknown'
    const body = await response.json()
    return body.private === false ? 'public' : 'private'
  } catch {
    return 'unknown'
  }
}

async function main() {
  if (!process.env.npm_execpath?.endsWith('.js')) fail('release.bat 또는 npm run release 로 실행하세요.')
  const slug = repoSlug()
  if (slug === null) fail('package.json 의 repository 에서 GitHub 저장소를 찾지 못했습니다.')
  const current = pkg.version
  if (parseVersion(current) === null) fail(`package.json 의 버전 ${current} 이 x.y.z 형식이 아닙니다.`)

  // 1. 저장소 상태: main 에서, 커밋하지 않은 변경 없이, 원격보다 뒤처지지 않게
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out
  if (branch !== 'main') fail(`main 브랜치에서만 릴리스합니다. 지금 브랜치: ${branch}`)
  const dirty = git(['status', '--porcelain']).out
  if (dirty !== '') fail(`커밋하지 않은 변경이 있습니다. 먼저 커밋하세요.\n${dirty}`)
  console.log('원격 저장소를 확인하는 중…')
  git(['fetch', '--tags', 'origin', 'main'])
  const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main']).out)
  if (behind > 0) fail(`원격 main 에 받지 않은 커밋이 ${behind}개 있습니다. git pull 로 받은 뒤 다시 실행하세요.`)

  // 2. 새 버전. 비우면 다음 패치 버전
  const [major, minor, patch] = parseVersion(current)
  const suggested = `${major}.${minor}.${patch + 1}`
  const input = process.argv[2] ?? (await ask(`지금 버전 ${current}. 새 버전 [${suggested}]: `))
  const version = (input.trim() || suggested).replace(/^v/, '')
  if (parseVersion(version) === null) fail(`버전 형식이 아닙니다: ${version} (예: ${suggested})`)
  if (compareVersions(version, current) <= 0) fail(`새 버전은 지금 버전 ${current} 보다 커야 합니다.`)
  const tag = `v${version}`
  if (git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], true).ok) fail(`태그 ${tag} 이 이미 있습니다.`)

  // 3. 무엇을 할지 보여 주고 확인받는다. 올리면 바로 공개된다
  const state = await visibility(slug)
  if (state === 'private') {
    console.warn('\n[주의] 저장소가 비공개이거나 찾을 수 없습니다. 비공개면 다른 사람은 설치 파일을 받을 수 없고 설치된 앱도 업데이트를 확인하지 못합니다.')
  } else if (state === 'unknown') {
    console.warn('\n[주의] 저장소가 공개인지 확인하지 못했습니다(네트워크 또는 GitHub API).')
  }
  console.log(`\n${current} → ${version}`)
  console.log('  1) typecheck·test')
  console.log(`  2) 버전 커밋 "릴리스 ${version}"과 태그 ${tag}`)
  console.log('  3) main 과 태그를 origin 에 올림 → GitHub Actions 가 빌드해 Releases 에 바로 공개')
  const answer = await ask('\n계속할까요? (y/N): ')
  if (answer.trim().toLowerCase() !== 'y') fail('취소했습니다. 아무것도 바꾸지 않았습니다.')

  // 4. 검사 → 버전 커밋·태그 → 올리기
  npm(['run', 'typecheck'])
  npm(['test'])
  npm(['version', version, '-m', '릴리스 %s'])

  // main 과 태그를 함께 올리고, 하나라도 거절되면 둘 다 올리지 않는다
  const push = spawnSync('git', ['push', '--atomic', 'origin', 'main', tag], { cwd: root, stdio: 'inherit' })
  if (push.status !== 0) {
    fail(
      `올리지 못했습니다. 버전 커밋과 태그 ${tag} 는 이 PC 에만 있습니다.\n` +
        `  다시 올리기: git push --atomic origin main ${tag}\n` +
        `  되돌리기:   git tag -d ${tag} 후 git reset --hard HEAD~1`
    )
  }

  console.log(`\n${tag} 을 올렸습니다. GitHub Actions 가 빌드해 공개합니다(10분 안팎).`)
  console.log(`  진행 상황: https://github.com/${slug}/actions`)
  console.log(`  릴리스:   https://github.com/${slug}/releases/tag/${tag}`)
  process.exitCode = 0
}

// 끝까지 가지 못하고 조용히 끝나면(기다리던 입력이 사라지는 등) 실패로 알린다
process.exitCode = 1
main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
