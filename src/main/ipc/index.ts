import { registerAgentIpc } from './agent'
import { registerAuthIpc } from './auth'
import { registerContextIpc } from './context'
import { registerGlossaryIpc } from './glossary'
import { registerJobsIpc } from './jobs'
import { registerAppSettingsIpc } from './app-settings'
import { registerProjectIpc } from './project'
import { registerReviewIpc } from './review'
import { registerStringsIpc } from './strings'

export function registerIpc(): void {
  registerAppSettingsIpc()
  registerProjectIpc()
  registerStringsIpc()
  registerAuthIpc()
  registerJobsIpc()
  registerContextIpc()
  registerGlossaryIpc()
  registerReviewIpc()
  registerAgentIpc()
}
