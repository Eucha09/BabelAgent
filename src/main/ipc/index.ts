import { registerAgentIpc } from './agent'
import { registerAuthIpc } from './auth'
import { registerJobsIpc } from './jobs'
import { registerAppSettingsIpc } from './app-settings'
import { registerProjectIpc } from './project'
import { registerStringsIpc } from './strings'

export function registerIpc(): void {
  registerAppSettingsIpc()
  registerProjectIpc()
  registerStringsIpc()
  registerAuthIpc()
  registerJobsIpc()
  registerAgentIpc()
}
