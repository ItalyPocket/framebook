export interface PanelMenuState { name: string; panels: { id: string; title: string; visible: boolean }[]; sideBySide?: boolean }
export interface PanelAction { name: string; action: 'toggle' | 'side' | 'reset'; id?: string }
