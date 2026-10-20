import { registerAgentIpc } from './agent'
import { registerAuthIpc } from './auth'
import { registerAppSettingsIpc } from './app-settings'
import { registerProjectIpc } from './project'
import { registerStringsIpc } from './strings'

export function registerIpc(): void {
  registerAppSettingsIpc()
  registerProjectIpc()
  registerStringsIpc()
  registerAuthIpc()
  registerAgentIpc()
}
