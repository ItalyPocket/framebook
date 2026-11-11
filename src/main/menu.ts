import { ipcMain, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { t } from '../shared/i18n'
import type { PanelMenuState, PanelAction } from '../shared/panels'
let state: PanelMenuState = { name: '', panels: [] }
let window: () => BrowserWindow | null = () => null
export function refreshNativeMenu(): void {
  const send = (action: PanelAction['action'], id?: string): void => { window()?.webContents.send('panels:action', { name: state.name, action, id }) }
  const panels: MenuItemConstructorOptions[] = state.panels.map(panel => ({ label: t(panel.title), type: 'checkbox', checked: panel.visible, click: () => send('toggle', panel.id) }))
  if (typeof state.sideBySide === 'boolean') panels.push({ type: 'separator' }, { label: t('Arrange side by side'), type: 'checkbox', checked: state.sideBySide, click: () => send('side') })
  if (state.panels.length) panels.push({ type: 'separator' }, { label: t('Reset layout'), click: () => send('reset') })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '帧册', submenu: [{ role: 'about', label: t('About') }, { type: 'separator' }, { role: 'quit', label: t('Quit') }] },
    { label: t('Edit'), submenu: [{ label: t('Undo'), accelerator: 'CmdOrCtrl+Z', click: () => window()?.webContents.send('history:action', 'undo') }, { label: t('Redo'), accelerator: 'CmdOrCtrl+Shift+Z', click: () => window()?.webContents.send('history:action', 'redo') }, { type: 'separator' }, { role: 'cut', label: t('Cut') }, { role: 'copy', label: t('Copy') }, { role: 'paste', label: t('Paste') }, { role: 'selectAll', label: t('Select all') }] },
    { label: t('Panels'), submenu: panels.length ? panels : [{ label: t('No auxiliary panels'), enabled: false }] },
    { label: t('View'), submenu: [{ role: 'togglefullscreen', label: t('Fullscreen') }] },
    { label: t('Window'), submenu: [{ role: 'minimize', label: t('Minimize') }, { role: 'zoom', label: t('Zoom') }] }
  ]))
}
export function setupNativeMenu(getWindow: () => BrowserWindow | null): void {
  window = getWindow
  ipcMain.handle('panels:state', (_event, value: PanelMenuState) => { state = { name: String(value.name), panels: value.panels.slice(0, 20).map(panel => ({ id: String(panel.id), title: String(panel.title), visible: !!panel.visible })), sideBySide: value.sideBySide }; refreshNativeMenu() })
  refreshNativeMenu()
}
