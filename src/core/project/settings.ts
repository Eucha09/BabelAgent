import type { ProjectConfig, ProjectSettingsPatch } from '@shared/schema/project'

/** project.json 에 화면에서 고친 값을 합친다. 패치에 없는 항목은 그대로 둔다. */
export function applySettingsPatch(config: ProjectConfig, patch: ProjectSettingsPatch): ProjectConfig {
  if (!patch.translate) return config
  return {
    ...config,
    translate: {
      model: patch.translate.model ?? config.translate.model,
      effort: patch.translate.effort ?? config.translate.effort
    }
  }
}

/** 바뀐 것이 있는지. 같으면 파일을 다시 쓰지 않는다. */
export function settingsChanged(before: ProjectConfig, after: ProjectConfig): boolean {
  return before.translate.model !== after.translate.model || before.translate.effort !== after.translate.effort
}
