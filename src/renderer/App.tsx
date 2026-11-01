import { useCallback, useEffect, useRef, useState } from 'react'
import { describeAuthMethod } from '@core/auth/method'
import type { AgentCheckResult, AuthStatus, LoginMethod } from '@shared/schema/agent'
import type { AppSettings } from '@shared/schema/app-settings'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import type { ClaudeCliStatus } from '@shared/schema/cli'
import type { CreateProjectInput, OpenProject, ProjectSettingsPatch } from '@shared/schema/project'
import type { IpcResult } from '@shared/types'
import type { AuthView } from './components/AccountCard'
import type { UsageView } from './components/UsageMeters'
import { AgentPanel, type ChatTurn, type RuleCard } from './components/AgentPanel'
import { ClaudeGate } from './components/ClaudeGate'
import { ConfirmDialog } from './components/ConfirmDialog'
import { NewProjectDialog } from './components/NewProjectDialog'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { Context } from './components/screens/Context'
import { Export } from './components/screens/Export'
import { Glossary } from './components/screens/Glossary'
import { Project } from './components/screens/Project'
import { Review, type ReviewFocus } from './components/screens/Review'
import { Settings, type SettingsPatch } from './components/screens/Settings'
import { Strings } from './components/screens/Strings'
import { Translate } from './components/screens/Translate'
import type { JobLogEntry, JobView } from '@shared/schema/jobs'
import { Welcome } from './components/screens/Welcome'
import { findScreen, type ScreenId } from './state/screens'
import { effortLabel, modelLabel } from './state/translate-options'

const api = window.babel

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [project, setProject] = useState<OpenProject | null>(null)
  const [screen, setScreen] = useState<ScreenId>('strings')
  /** 지금 화면에 저장하지 않은 편집이 있는지(프로젝트·원문 화면이 알려 준다). 다른 화면으로 갈 때 확인을 받는다. */
  const [unsaved, setUnsaved] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<
    { kind: 'screen'; id: ScreenId } | { kind: 'close' } | { kind: 'update' } | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** 앱을 켤 때 Claude Code 확인·업데이트 창이 끝났는지. 끝나기 전에는 CLI 를 부르는 조회(로그인 상태 등)를 하지 않는다 */
  const [startupDone, setStartupDone] = useState(false)
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null)
  const [cliBusy, setCliBusy] = useState(false)
  /** 앱(Babel Agent) 업데이트 상태. 메인이 바뀔 때마다 보내 준다 */
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus | null>(null)
  const [checkResult, setCheckResult] = useState<AgentCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [newProjectDir, setNewProjectDir] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [turns, setTurns] = useState<readonly ChatTurn[]>([])
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageView>({ limits: null, loading: false, error: null })
  /** 진행 중이거나 마지막으로 끝난 번역 작업. 번역 화면과 패널이 같이 본다. */
  const [job, setJob] = useState<JobView | null>(null)
  const [jobLog, setJobLog] = useState<readonly JobLogEntry[]>([])
  const [auth, setAuth] = useState<AuthView>({
    status: null,
    error: null,
    loading: true,
    loginRunning: false
  })

  useEffect(() => {
    void api.settings.get().then((result) => {
      if (result.ok) setSettings(result.value)
      else setMessage(result.error.message)
    })
  }, [])

  // 에이전트 스트리밍 이벤트 구독
  useEffect(() => {
    const offDelta = api.agent.onDelta(({ requestId, text }) => {
      setTurns((prev) => {
        const index = prev.findIndex((turn) => turn.id === requestId)
        if (index === -1) return [...prev, { id: requestId, role: 'agent', text }]
        const next = [...prev]
        const turn = next[index]
        if (turn) next[index] = { ...turn, text: turn.text + text }
        return next
      })
    })
    const offEnd = api.agent.onEnd(({ sessionId: id, durationMs }) => {
      setSending(false)
      setSessionId(id)
      setMessage(`에이전트 응답 완료 (${(durationMs / 1000).toFixed(1)}초)`)
    })
    const offError = api.agent.onError(({ requestId, message: text, detail, kind }) => {
      setSending(false)
      setTurns((prev) => [
        ...prev,
        { id: `${requestId}-error`, role: 'error', text, ...(detail ? { detail } : {}) }
      ])
      setMessage(`에이전트 오류: ${kind}`)
    })
    let toolCount = 0
    const offTool = api.agent.onTool(({ requestId, name, summary, ok }) => {
      toolCount += 1
      setTurns((prev) => [...prev, { id: `${requestId}-tool-${toolCount}`, role: 'tool', text: `${name} → ${summary}`, ok }])
    })
    // 에이전트가 낸 스타일 규칙 제안. 사용자가 카드에서 [저장]을 눌러야 저장된다.
    const offRule = api.agent.onRule(({ requestId, proposalId, change, currentText }) => {
      setTurns((prev) => [
        ...prev,
        { id: `${requestId}-rule-${proposalId}`, role: 'rule', text: '', rule: { change, currentText, state: 'pending' } }
      ])
    })
    return () => {
      offDelta()
      offEnd()
      offError()
      offTool()
      offRule()
    }
  }, [])

  // project.json 을 앱 밖에서 고치면 메인이 다시 읽어 보내 준다(검사 설정·톤 가이드 등)
  useEffect(() => {
    return api.project.onChanged((next) => {
      setProject((prev) => (prev && prev.dir === next.dir ? next : prev))
      setMessage('project.json 이 바뀌어 설정을 다시 읽었습니다.')
    })
  }, [])

  // 번역 작업 상태와 로그. 화면을 오가도 이어지도록 여기서 받는다.
  useEffect(() => {
    void api.jobs.current().then((current) => {
      if (current) setJob(current)
    })
    const offUpdate = api.jobs.onUpdate(setJob)
    const offLog = api.jobs.onLog((entry) => setJobLog((prev) => [...prev, entry].slice(-500)))
    return () => {
      offUpdate()
      offLog()
    }
  }, [])

  const refreshUsage = useCallback(async () => {
    setUsage((prev) => ({ ...prev, loading: true }))
    const result = await api.usage.read()
    setUsage({
      loading: false,
      limits: result.ok ? result.value : null,
      error: result.ok ? null : result.error
    })
  }, [])

  const refreshAuth = useCallback(async (): Promise<AuthStatus | null> => {
    setAuth((prev) => ({ ...prev, loading: true }))
    const result = await api.auth.status()
    setAuth((prev) => ({
      ...prev,
      loading: false,
      status: result.ok ? result.value : null,
      error: result.ok ? null : result.error
    }))
    return result.ok ? result.value : null
  }, [])

  // 업데이트 중에 다른 CLI 호출이 실행 파일을 잡지 않게, 확인 창이 끝난 뒤에 로그인 상태를 읽는다
  useEffect(() => {
    if (startupDone) void refreshAuth()
  }, [startupDone, refreshAuth])

  // 앱 업데이트 상태. 새 버전을 처음 찾았을 때만 상태바 메시지로 알린다
  const lastUpdateKind = useRef<string | null>(null)
  useEffect(() => {
    const apply = (status: AppUpdateStatus): void => {
      const { state } = status
      if (state.kind === 'available' && lastUpdateKind.current !== 'available') {
        setMessage(`새 버전 ${state.version} 이 있습니다. 상태바나 설정 화면에서 [받기]를 누르세요.`)
      }
      if (state.kind === 'downloaded' && lastUpdateKind.current !== 'downloaded') {
        setMessage(`${state.version} 을 받아 두었습니다. 다시 시작하거나 앱을 끌 때 설치됩니다.`)
      }
      lastUpdateKind.current = state.kind
      setAppUpdate(status)
    }
    void api.appUpdate.status().then((result) => {
      if (result.ok) apply(result.value)
    })
    return api.appUpdate.onState(apply)
  }, [])

  // Claude Code 확인 창이 끝난 뒤 한 번 확인한다(이후는 메인이 6시간마다 확인한다)
  useEffect(() => {
    if (startupDone) void api.appUpdate.check()
  }, [startupDone])

  const checkAppUpdate = useCallback(async () => {
    const result = await api.appUpdate.check()
    if (!result.ok) setMessage(result.error.message)
    else if (result.value.state.kind === 'current') setMessage('앱이 최신 버전입니다.')
  }, [])

  const downloadAppUpdate = useCallback(async () => {
    const result = await api.appUpdate.download()
    if (!result.ok) setMessage(result.error.message)
  }, [])

  const cancelAppUpdate = useCallback(async () => {
    await api.appUpdate.cancel()
    setMessage('업데이트 받기를 멈췄습니다.')
  }, [])

  const installAppUpdate = useCallback(async () => {
    const result = await api.appUpdate.install()
    if (!result.ok) setMessage(result.error.message)
    else setMessage('업데이트를 설치하려고 앱을 닫습니다. 설치가 끝나면 다시 열립니다.')
  }, [])

  /** 저장하지 않은 편집이 있으면 먼저 확인을 받는다 */
  const requestAppUpdateInstall = useCallback(() => {
    if (unsaved) setPendingLeave({ kind: 'update' })
    else void installAppUpdate()
  }, [installAppUpdate, unsaved])

  const refreshCli = useCallback(async () => {
    const result = await api.cli.status()
    if (result.ok) setCliStatus(result.value)
    return result.ok ? result.value : null
  }, [])

  // 설정 화면에서 띄운 설치 창이 닫히면 다시 읽는다(시작 확인 창은 자기가 다시 확인한다)
  useEffect(() => {
    if (!startupDone) return
    return api.cli.onInstallDone(() => {
      setCliBusy(false)
      void refreshCli().then((status) => {
        setMessage(status?.version ? `Claude Code ${status.version} 을 찾았습니다.` : 'Claude Code 를 찾지 못했습니다. 설치 창의 메시지를 확인하세요.')
        if (status?.version) void refreshAuth()
      })
    })
  }, [startupDone, refreshCli, refreshAuth])

  const updateCli = useCallback(async () => {
    setCliBusy(true)
    try {
      const result = await api.cli.update()
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      setCliStatus(result.value.status)
      const { outcome, before, after } = result.value
      setMessage(
        outcome === 'updated'
          ? `Claude Code 를 ${before ?? '?'} → ${after ?? '?'} 으로 업데이트했습니다.`
          : outcome === 'current'
            ? `Claude Code 가 최신입니다 (${after ?? '?'}).`
            : outcome === 'skipped'
              ? '개발용 Claude Code 는 업데이트하지 않습니다.'
              : '업데이트하지 못했습니다. 설정 화면에서 다시 시도하세요.'
      )
    } finally {
      setCliBusy(false)
    }
  }, [])

  const installCli = useCallback(async () => {
    const result = await api.cli.install()
    if (!result.ok) setMessage(result.error.message)
    else {
      setCliBusy(true)
      setMessage('설치 창에서 진행합니다. 끝나면 그 창을 닫으세요.')
    }
  }, [])

  // 로그인은 Claude Code 자기 창에서 진행한다. 창이 닫히면 상태를 다시 읽어 결과를 알린다
  useEffect(() => {
    return api.auth.onLoginDone(() => {
      setAuth((prev) => ({ ...prev, loginRunning: false }))
      void refreshAuth().then((status) => {
        if (status?.loggedIn) {
          setMessage(`로그인 상태를 확인했습니다: ${describeAuthMethod(status).label}`)
          if (describeAuthMethod(status).kind === 'subscription') void refreshUsage()
        } else {
          setMessage('로그인 창이 닫혔지만 로그인되지 않았습니다.')
        }
      })
    })
  }, [refreshAuth, refreshUsage])

  const startLogin = useCallback(async (method: LoginMethod) => {
    setAuth((prev) => ({ ...prev, error: null, loginRunning: true }))
    const result = await api.auth.loginStart(method)
    if (!result.ok) {
      setAuth((prev) => ({ ...prev, loginRunning: false, error: result.error }))
    }
  }, [])

  const cancelLogin = useCallback(async () => {
    await api.auth.loginCancel()
    setAuth((prev) => ({ ...prev, loginRunning: false }))
    setMessage('로그인 창을 닫았습니다.')
  }, [])

  const logout = useCallback(async () => {
    setBusy(true)
    try {
      const result = await api.auth.logout()
      if (result.ok) setMessage('로그아웃했습니다.')
      else setAuth((prev) => ({ ...prev, error: result.error }))
      await refreshAuth()
    } finally {
      setBusy(false)
    }
  }, [refreshAuth])

  useEffect(() => {
    // CLI를 띄우는 조회라 설정 화면을 열었을 때 한 번만 읽는다
    if (screen !== 'settings') return
    if (usage.limits !== null || usage.loading || usage.error !== null) return
    // 사용량 한도는 구독에만 있다. API 키·클라우드 제공자는 /usage 를 돌리지 않는다
    if (describeAuthMethod(auth.status).kind !== 'subscription') return
    void refreshUsage()
  }, [screen, usage, auth.status, refreshUsage])

  const applyProject = useCallback((result: IpcResult<OpenProject>) => {
    if (result.ok) {
      setProject(result.value)
      setScreen('strings')
      setTurns([])
      setSessionId(null)
      setMessage(`프로젝트를 열었습니다: ${result.value.config.name}`)
    } else {
      setMessage(result.error.message)
    }
  }, [])

  const openPath = useCallback(
    async (dir: string) => {
      setBusy(true)
      try {
        applyProject(await api.project.open(dir))
      } finally {
        setBusy(false)
      }
    },
    [applyProject]
  )

  const pickAndOpen = useCallback(async () => {
    setBusy(true)
    try {
      const picked = await api.project.pick()
      if (!picked.ok) {
        if (picked.error.kind !== 'cancelled') setMessage(picked.error.message)
        return
      }
      applyProject(await api.project.open(picked.value))
    } finally {
      setBusy(false)
    }
  }, [applyProject])

  const pickAndCreate = useCallback(async () => {
    setBusy(true)
    try {
      const picked = await api.project.pick()
      if (!picked.ok) {
        if (picked.error.kind !== 'cancelled') setMessage(picked.error.message)
        return
      }
      setNewProjectDir(picked.value)
    } finally {
      setBusy(false)
    }
  }, [])

  const createProject = useCallback(
    async (input: CreateProjectInput) => {
      setBusy(true)
      try {
        const result = await api.project.create(input)
        if (result.ok) setNewProjectDir(null)
        applyProject(result)
        // 새 프로젝트는 게임 소개·톤 가이드부터 채우도록 프로젝트 화면에서 시작한다
        if (result.ok) setScreen('project')
      } finally {
        setBusy(false)
      }
    },
    [applyProject]
  )

  const closeProject = useCallback(async () => {
    setBusy(true)
    try {
      await api.project.close()
      setProject(null)
      setTurns([])
      setSessionId(null)
      setMessage('프로젝트를 닫았습니다.')
    } finally {
      setBusy(false)
    }
  }, [])

  const saveSettings = useCallback(async (patch: SettingsPatch) => {
    setBusy(true)
    try {
      const result = await api.settings.set(patch)
      if (result.ok) {
        setSettings(result.value)
        setCheckResult(null)
        setMessage('설정을 저장했습니다.')
        void refreshCli()
        void refreshAuth()
      } else {
        setMessage(result.error.message)
      }
    } finally {
      setBusy(false)
    }
  }, [refreshAuth, refreshCli])

  /** project.json 부분 갱신. 프로젝트·번역·설정 화면이 같이 쓴다. 저장되면 열린 프로젝트 상태도 맞춘다. */
  const updateProject = useCallback(async (patch: ProjectSettingsPatch): Promise<IpcResult<OpenProject>> => {
    const result = await api.project.setSettings(patch)
    if (result.ok) setProject(result.value)
    return result
  }, [])

  /** 번역 화면과 설정 화면의 번역 모델·사고 수준 저장 */
  const saveTranslateSettings = useCallback(
    async (patch: ProjectSettingsPatch) => {
      const result = await updateProject(patch)
      if (!result.ok) {
        setMessage(result.error.message)
        return
      }
      const { model, effort } = result.value.config.translate
      setMessage(`번역 설정을 저장했습니다: ${modelLabel(model)} · 사고 ${effortLabel(effort)}`)
    },
    [updateProject]
  )

  /** 저장하지 않은 편집이 있으면 먼저 확인을 받는다. */
  /** 내보내기 진단에서 검토 화면의 한 행으로 갈 때. 사이드바로 옮기면 지운다 */
  const [reviewFocus, setReviewFocus] = useState<ReviewFocus | null>(null)

  const selectScreen = useCallback(
    (id: ScreenId) => {
      setReviewFocus(null)
      if (id === screen) return
      if (unsaved) setPendingLeave({ kind: 'screen', id })
      else setScreen(id)
    },
    [screen, unsaved]
  )

  const requestClose = useCallback(() => {
    if (unsaved) setPendingLeave({ kind: 'close' })
    else void closeProject()
  }, [closeProject, unsaved])

  const checkAgent = useCallback(async () => {
    setChecking(true)
    try {
      setCheckResult(await api.agent.check())
    } finally {
      setChecking(false)
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!project) return
      const requestId = crypto.randomUUID()
      setTurns((prev) => [...prev, { id: `${requestId}-user`, role: 'user', text }])
      setSending(true)
      setMessage('에이전트에 요청을 보냈습니다…')
      setActiveRequestId(requestId)
      const result = await api.agent.send({ requestId, text, projectDir: project.dir, sessionId })
      if (!result.ok) {
        setSending(false)
        setTurns((prev) => [
          ...prev,
          { id: `${requestId}-error`, role: 'error', text: result.error.message }
        ])
      }
    },
    [project, sessionId]
  )

  const updateRuleCard = useCallback((turnId: string, patch: Partial<RuleCard>) => {
    setTurns((prev) =>
      prev.map((turn) => (turn.id === turnId && turn.rule ? { ...turn, rule: { ...turn.rule, ...patch } } : turn))
    )
  }, [])

  /** 규칙 카드의 [저장]. 메인이 지금 규칙에 다시 적용해 보고 검증을 거쳐 project.json 에 쓴다. */
  const saveRule = useCallback(
    async (turnId: string) => {
      const card = turns.find((turn) => turn.id === turnId)?.rule
      if (!card || card.state === 'saving' || card.state === 'saved') return
      updateRuleCard(turnId, { state: 'saving' })
      const result = await api.project.applyRule(card.change)
      if (!result.ok) {
        updateRuleCard(turnId, { state: 'failed', error: result.error.message })
        return
      }
      setProject(result.value.project)
      updateRuleCard(turnId, { state: 'saved', ruleId: result.value.ruleId })
      setMessage(`스타일 규칙을 저장했습니다 (${result.value.ruleId}). 다음 번역 배치부터 반영됩니다.`)
    },
    [turns, updateRuleCard]
  )

  const dismissRule = useCallback(
    (turnId: string) => {
      updateRuleCard(turnId, { state: 'dismissed' })
    },
    [updateRuleCard]
  )

  const cancelMessage = useCallback(async () => {
    if (!activeRequestId) return
    await api.agent.cancel({ requestId: activeRequestId })
  }, [activeRequestId])

  const screenDef = findScreen(screen)
  // 프로젝트가 없으면 메인에 시작 화면이 뜨므로 칩도 그에 맞춘다
  const screenLabel = screen === 'settings' ? '설정' : project ? screenDef.label : '시작'

  return (
    <div className="app-shell">
      <TitleBar project={project} screenLabel={screenLabel} />

      <Sidebar
        project={project}
        current={screen}
        onSelect={selectScreen}
        onOpen={pickAndOpen}
        onCreate={pickAndCreate}
        onClose={requestClose}
        busy={busy}
      />

      <main className="main-area">
        {screen === 'settings' && settings ? (
          <Settings
            settings={settings}
            busy={busy}
            checking={checking}
            checkResult={checkResult}
            onSave={saveSettings}
            onCheck={checkAgent}
            auth={auth}
            usage={usage}
            onAuthRefresh={() => {
              void refreshAuth().then((status) => {
                if (describeAuthMethod(status).kind === 'subscription') void refreshUsage()
              })
            }}
            onLoginStart={(method) => void startLogin(method)}
            onLoginCancel={cancelLogin}
            onLogout={logout}
            project={project}
            onProjectSettings={(patch) => void saveTranslateSettings(patch)}
            cli={cliStatus}
            cliBusy={cliBusy}
            jobRunning={job !== null && job.snapshot.state !== 'done' && job.snapshot.state !== 'cancelled'}
            onCliUpdate={() => void updateCli()}
            onCliInstall={() => void installCli()}
            appUpdate={appUpdate}
            onAppUpdateCheck={() => void checkAppUpdate()}
            onAppUpdateDownload={() => void downloadAppUpdate()}
            onAppUpdateCancel={() => void cancelAppUpdate()}
            onAppUpdateInstall={requestAppUpdateInstall}
          />
        ) : project && screen === 'project' ? (
          <Project key={project.dir} project={project} onSave={updateProject} onDirtyChange={setUnsaved} onMessage={setMessage} />
        ) : project && screen === 'strings' ? (
          <Strings key={project.dir} syntax={project.config.smartStrings} onMessage={setMessage} onDirtyChange={setUnsaved} />
        ) : project && screen === 'context' ? (
          <Context key={project.dir} project={project} job={job} jobLog={jobLog} onMessage={setMessage} onDirtyChange={setUnsaved} />
        ) : project && screen === 'glossary' ? (
          <Glossary key={project.dir} project={project} job={job} jobLog={jobLog} onMessage={setMessage} onDirtyChange={setUnsaved} />
        ) : project ? (
          screen === 'translate' ? (
            <Translate
              key={project.dir}
              project={project}
              job={job}
              jobLog={jobLog}
              onMessage={setMessage}
              onSettings={(patch) => void saveTranslateSettings(patch)}
            />
          ) : screen === 'review' ? (
            <Review key={project.dir} project={project} job={job} onMessage={setMessage} initialFocus={reviewFocus} />
          ) : screen === 'export' ? (
            <Export
              key={project.dir}
              project={project}
              onSettings={updateProject}
              onProjectReplaced={setProject}
              onOpenReview={(focus) => {
                setReviewFocus(focus)
                setScreen('review')
              }}
              onOpenProjectSettings={() => selectScreen('project')}
              onMessage={setMessage}
            />
          ) : (
            // 설정 화면인데 앱 설정을 아직 읽는 중일 때
            null
          )
        ) : (
          <Welcome
            lastProjectDir={settings?.lastProjectDir ?? null}
            busy={busy}
            onOpen={pickAndOpen}
            onCreate={pickAndCreate}
            onOpenPath={openPath}
          />
        )}
      </main>

      <AgentPanel
        jobLog={jobLog}
        jobRunning={job !== null && job.snapshot.state !== 'done' && job.snapshot.state !== 'cancelled'}
        collapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed((value) => !value)}
        turns={turns}
        sending={sending}
        projectOpen={project !== null}
        sessionId={sessionId}
        onSend={sendMessage}
        onCancel={cancelMessage}
        onRuleSave={(turnId) => void saveRule(turnId)}
        onRuleDismiss={dismissRule}
      />

      <StatusBar
        project={project}
        checkResult={checkResult}
        checking={checking}
        auth={auth}
        sessionId={sessionId}
        message={message}
        appUpdate={appUpdate}
        onAppUpdateDownload={() => void downloadAppUpdate()}
        onAppUpdateInstall={requestAppUpdateInstall}
      />

      {pendingLeave ? (
        <ConfirmDialog
          title="저장하지 않은 변경"
          confirmLabel={
            pendingLeave.kind === 'close' ? '버리고 닫기' : pendingLeave.kind === 'update' ? '버리고 다시 시작' : '버리고 이동'
          }
          danger
          onCancel={() => setPendingLeave(null)}
          onConfirm={() => {
            const leave = pendingLeave
            setPendingLeave(null)
            // 다시 시작하지 못하면(작업 중 등) 편집이 화면에 그대로 남으므로 표시를 지우지 않는다
            if (leave.kind === 'update') {
              void installAppUpdate()
              return
            }
            setUnsaved(false)
            if (leave.kind === 'close') void closeProject()
            else setScreen(leave.id)
          }}
        >
          <p className="hint">
            {findScreen(screen).label} 화면에 저장하지 않은 변경이 있습니다.{' '}
            {pendingLeave.kind === 'close'
              ? '프로젝트를 닫으면'
              : pendingLeave.kind === 'update'
                ? '업데이트를 설치하려고 다시 시작하면'
                : '다른 화면으로 가면'}{' '}
            그
            변경은 사라집니다.
          </p>
        </ConfirmDialog>
      ) : null}

      {newProjectDir ? (
        <NewProjectDialog
          dir={newProjectDir}
          busy={busy}
          onCancel={() => setNewProjectDir(null)}
          onSubmit={createProject}
        />
      ) : null}

      {!startupDone ? (
        <ClaudeGate
          onFinished={(status, text) => {
            setCliStatus(status)
            setStartupDone(true)
            if (text) setMessage(text)
          }}
        />
      ) : null}
    </div>
  )
}
