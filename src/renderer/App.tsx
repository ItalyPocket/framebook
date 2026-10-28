import { useLanguage } from './language'
import { t } from '@shared/i18n'
/**
 * App shell: welcome screen, titlebar, the three-panel workspace + board,
 * global keyboard map, autosave, credits.
 */

import { useCallback, useEffect } from 'react'
import { useStore, currentProjectJson } from './store'
import { MediaBin } from './panels/MediaBin'
import { Viewer } from './panels/Viewer'
import { Inspector } from './panels/Inspector'
import { Board } from './panels/Board'
import { Toasts } from './panels/Toasts'
import { HelpOverlay } from './panels/Help'
import { Present } from './panels/Present'
import { Gallery } from './panels/Gallery'
import { StoryboardEditor } from './panels/Storyboard'

function CreditLink({ url, children }: { url: string; children: string }): JSX.Element {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        void window.sbr.openExternal(url)
      }}
    >
      {children}
    </a>
  )
}

export function Credits(): JSX.Element {
  return (
    <div className="credits">
      {t("Created by Sam Wasserman ·")}{' '}
      <CreditLink url="https://wassermanproductions.com">wassermanproductions.com</CreditLink> ·{' '}
      <CreditLink url="https://wasserman.ai">wasserman.ai</CreditLink>
      <br />
      {t("Open source under Apache-2.0 — keep this credit when using or forking.")}</div>
  )
}

function Welcome(): JSX.Element {
  const newProject = useStore((s) => s.newProject)
  const loadFromJson = useStore((s) => s.loadFromJson)
  const toast = useStore((s) => s.toast)
  const setHelpOpen = useStore((s) => s.setHelpOpen)

  const onNew = useCallback(async () => {
    const folder = await window.sbr.newProjectDialog()
    if (!folder) return
    const name = folder.split(/[/\\]/).pop()?.replace(/\.sbref$/, '') ?? t("Untitled")
    newProject(folder, name)
    const json = currentProjectJson()
    if (json) {
      try { await window.sbr.saveProject(folder, json); useStore.getState().markSaved(json); toast(t('Project saved.'), 'success') }
      catch (error) { toast(t('Could not save project: {error}', { error: (error as Error).message }), 'error') }
    }
  }, [newProject])

  const onOpen = useCallback(async () => {
    const folder = await window.sbr.openProjectDialog()
    if (!folder) return
    const { json, backupJson, backupNewer } = await window.sbr.loadProject(folder)
    if (!json && !backupJson) {
      toast(t("No project.json found in that folder."), 'error')
      return
    }
    if (backupNewer && backupJson && loadFromJson(folder, backupJson)) {
      toast(t("Restored unsaved work from the autosave backup — Save to keep it."), 'success')
      return
    }
    if (json && loadFromJson(folder, json)) return
    if (backupJson && loadFromJson(folder, backupJson)) {
      toast(t("Recovered from autosave backup."), 'success')
    }
  }, [loadFromJson, toast])

  return (
    <div className="welcome">
      <div className="welcome-collage" aria-hidden="true"><div className="collage-orbit"/><div className="collage-grid"/><div className="collage-frame frame-a">01</div><div className="collage-frame frame-b">02</div><div className="collage-block"/><span>LOOK / FRAME / THINK</span></div>
      <div className="welcome-title"><span className="eyebrow">A FIELD GUIDE TO MOVING IMAGES</span><h1>帧册<span>FRAMEBOOK</span></h1></div>
      <p>
        {t("Capture a frame. Understand a shot. Build your story.")}</p>
      <div className="actions">
        <button className="btn primary" onClick={onNew}>{t("New Project")}</button>
        <button className="btn" onClick={onOpen}>{t("Open Project…")}</button>
        <button className="btn" onClick={() => setHelpOpen(true)}>{t("? Quick start")}</button>
      </div>
      <Credits />
    </div>
  )
}

function useAutosave(): void {
  const hasDoc = useStore((s) => s.doc !== null)
  const folder = useStore((s) => s.projectFolder)
  useEffect(() => {
    if (!hasDoc || !folder) return
    const interval = setInterval(() => {
      const json = currentProjectJson()
      if (json) void window.sbr.saveBackup(folder, json)
    }, 60_000)
    return () => clearInterval(interval)
  }, [hasDoc, folder])
}

interface Transport {
  togglePlay(): void
  step(frames: number): void
  bookmark(): void
  setIn(): void
  setOut(): void
}

function useKeyboard(): void {
  useEffect(() => window.sbr.onHistory((action) => {
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.execCommand(action)
    else useStore.getState()[action]()
  }), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (!s.doc) return
      const inField =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      const transport = (window as unknown as { __sbrTransport?: Transport }).__sbrTransport
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 's') {
        e.preventDefault()
        const json = currentProjectJson()
        if (json && s.projectFolder) void window.sbr.saveProject(s.projectFolder, json).then(() => { s.markSaved(json); s.toast(t('Project saved.'), 'success') }).catch((error) => s.toast(t('Could not save project: {error}', { error: (error as Error).message }), 'error'))
        return
      }
      if (e.key === '?') {
        s.setHelpOpen(!s.helpOpen)
        return
      }
      if (e.key === 'Escape' && s.helpOpen) {
        s.setHelpOpen(false)
        return
      }
      // Present mode owns the keyboard while it's open (it captures keys).
      if (s.presentOpen) return
      if (inField) return
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (s.workspace !== 'capture') return

      if (e.key === 'p' || e.key === 'P') {
        if (s.doc && s.orderedFrames().length > 0) s.setPresentOpen(true)
        return
      }
      if (e.key === 'a' || e.key === 'A') {
        s.setAnnotTool(s.annotTool === 'arrow' ? 'none' : 'arrow')
        return
      }
      if (e.key === 't' || e.key === 'T') {
        s.setAnnotTool(s.annotTool === 'text' ? 'none' : 'text')
        return
      }
      if (e.key === 'g' || e.key === 'G') {
        s.setGuidesOn(!s.guidesOn)
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        transport?.togglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        transport?.step(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        transport?.step(1)
      } else if (e.key === 'i' || e.key === 'I') {
        transport?.setIn()
      } else if (e.key === 'o' || e.key === 'O') {
        transport?.setOut()
      } else if (e.key === 'b' || e.key === 'B') {
        transport?.bookmark()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        // A selected annotation deletes first (leaves the frame in place).
        if (s.selectedAnnotationId && s.selectedFrameId) {
          s.removeAnnotation(s.selectedFrameId, s.selectedAnnotationId)
          s.selectAnnotation(null)
          const json = currentProjectJson()
          if (json && s.projectFolder) void window.sbr.saveProject(s.projectFolder, json)
          return
        }
        if (s.selectedFrameId) {
          const frame = s.frame(s.selectedFrameId)
          if (frame?.prompt?.text && !window.confirm(t("This frame has a prompt. Remove it?"))) return
          s.removeFrame(s.selectedFrameId)
          const json = currentProjectJson()
          if (json && s.projectFolder) void window.sbr.saveProject(s.projectFolder, json)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App(): JSX.Element {
  const language = useLanguage((s) => s.preference)
  const doc = useStore((s) => s.doc)
  const workspace = useStore((s) => s.workspace)
  const canUndo = useStore((s) => s.history.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const dirty = useStore((s) => s.dirty)
  const folder = useStore((s) => s.projectFolder)
  const markSaved = useStore((s) => s.markSaved)

  useAutosave()
  useKeyboard()

  const onSave = useCallback(async () => {
    const json = currentProjectJson()
    if (json && folder) {
      try {
        await window.sbr.saveProject(folder, json)
        markSaved(json)
        useStore.getState().toast(t('Project saved.'), 'success')
      } catch (error) {
        useStore.getState().toast(t('Could not save project: {error}', { error: (error as Error).message }), 'error')
      }
    }
  }, [folder, markSaved])

  if (!doc) {
    return (
      <div className="app welcome-app" data-language={language}>
        <div className="titlebar">
          <span className="app-name">帧册 / FRAMEBOOK</span>
          <div className="spacer" /><LanguageSelect />
        </div>
        <Welcome />
        <Toasts />
        <HelpOverlay />
      </div>
    )
  }

  return (
    <div className="app" data-language={language}>
      <div className="titlebar">
        <span className="app-name">帧册 / FRAMEBOOK</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          {doc.name}
          {dirty ? ' •' : ''}
        </span>
        <div className="spacer" />
        <button className="btn small" disabled={!canUndo} onClick={() => useStore.getState().undo()}>{t('Undo')}</button>
        <button className="btn small" disabled={!canRedo} onClick={() => useStore.getState().redo()}>{t('Redo')}</button>
        <LanguageSelect />
        <button className="btn small" onClick={onSave}>{t("Save")}</button>
        <button className="btn small" onClick={() => useStore.getState().setHelpOpen(true)}>{t("? Help")}</button>
      </div>
      <nav className="workspace-nav">{(['capture', 'gallery', 'storyboard'] as const).map((value, index) => <button key={value} className={workspace === value ? 'active' : ''} onClick={() => useStore.getState().setWorkspace(value)}><span>0{index + 1}</span>{t({capture: 'Capture', gallery: 'Frame gallery', storyboard: 'Storyboard editor'}[value])}</button>)}<span className="nav-note">FRAMEBOOK / {doc.frames.length} {t('frames')} / {doc.storyboard.shots.length} {t('shots')}</span></nav>
      {workspace === 'capture' ? <div className="workspace"><MediaBin /><Viewer /><Inspector /><Board /></div> : workspace === 'gallery' ? <Gallery /> : <StoryboardEditor />}
      <Toasts />
      <HelpOverlay />
      <Present />
    </div>
  )
}

function LanguageSelect(): JSX.Element {
  const { preference, change } = useLanguage()
  return <select className="language-select" aria-label={t('Language')} value={preference} onChange={(e) => change(e.target.value as typeof preference)}>
    <option value="system">{t('Follow system')}</option>
    <option value="zh-CN">简体中文</option>
    <option value="en">English</option>
  </select>
}
