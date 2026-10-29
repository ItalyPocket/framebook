import { LibTVUploads } from './components/LibTV'
import { DockLayout } from './components/DockLayout'
import { useLanguage } from './language'
import { t } from '@shared/i18n'
/**
 * App shell: welcome screen, titlebar, the three-panel workspace + board,
 * global keyboard map, autosave, credits.
 */

import { LaunchIntro, shouldShowIntro } from './components/LaunchIntro'
import { useSettings } from './settings'
import { Production } from './panels/Production'
import { useFileDrop } from './lib/fileDrop'
import { ProjectLibrary, SettingsDialog } from './components/ProjectManager'
import { ActionLabel, TopAction } from './components/TopActions'
import { Fragment, useCallback, useEffect, useState, useRef } from 'react'
import { ArtComposition } from './components/ArtComposition'
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
      Sam Wasserman ·{' '}
      <CreditLink url="https://wassermanproductions.com">Storyboard Reference Studio</CreditLink>
      {' · '}
      <CreditLink url="https://github.com/ItalyPocket/framebook/blob/main/LICENSE">
        Apache-2.0
      </CreditLink>
    </div>
  )
}

function Welcome({ openLibrary, resume }: { openLibrary(): void; resume?: () => void }): JSX.Element {
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  return (
    <div className="welcome">
      <ArtComposition variant="welcome" />
      <div className="welcome-title">
        <span className="eyebrow">01 — A FIELD GUIDE TO MOVING IMAGES</span>
        <h1>
          帧册
          <span>
            FRAME
            <br />
            BOOK<span className="brand-dot">01</span>
          </span>
        </h1>
        <div className="welcome-rule" />
      </div>
      <p>{t('Capture a frame. Understand a shot. Build your story.')}</p>
      <div className="actions">
        {resume && <button className="btn primary" onClick={resume}>{t('Continue project')}</button>}
        <button className="btn primary" onClick={openLibrary}>
          {t('New Project')}
        </button>
        <button className="btn" onClick={openLibrary}>
          {t('Open Project…')}
        </button>
        <button className="btn" onClick={() => setHelpOpen(true)}>
          {t('? Quick start')}
        </button>
      </div>
    </div>
  )
}

function useAutosave(): void {
  const settings = useSettings((s) => s.value)
  const hasDoc = useStore((s) => s.doc !== null)
  const folder = useStore((s) => s.projectFolder)
  useEffect(() => {
    if (!hasDoc || !folder) return
    if (!settings?.autosave) return
    let saving = false
    const interval = setInterval(() => {
      const state = useStore.getState()
      const json = currentProjectJson()
      if (!state.dirty || saving || !json || state.projectFolder !== folder) return
      saving = true
      void window.sbr
        .saveProject(folder, json)
        .then(() => {
          if (useStore.getState().projectFolder === folder) state.markSaved(json)
        })
        .catch((error) =>
          state.toast(t('Operation failed: {error}', { error: String(error) }), 'error')
        )
        .finally(() => {
          saving = false
        })
    }, settings.autosaveSeconds * 1000)
    return () => clearInterval(interval)
  }, [hasDoc, folder, settings?.autosave, settings?.autosaveSeconds])
}

interface Transport {
  togglePlay(): void
  step(frames: number): void
  bookmark(): void
  setIn(): void
  setOut(): void
}

function useKeyboard(enabled: boolean): void {
  useEffect(
    () =>
      window.sbr.onHistory((action) => {
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        )
          document.execCommand(action)
        else useStore.getState()[action]()
      }),
    []
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (!enabled || !s.doc) return
      const inField =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      const transport = (window as unknown as { __sbrTransport?: Transport }).__sbrTransport
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 's') {
        e.preventDefault()
        const json = currentProjectJson()
        if (json && s.projectFolder)
          void window.sbr
            .saveProject(s.projectFolder, json)
            .then(() => {
              s.markSaved(json)
              s.toast(t('Project saved.'), 'success')
            })
            .catch((error) =>
              s.toast(
                t('Could not save project: {error}', { error: (error as Error).message }),
                'error'
              )
            )
        return
      }
      if (document.querySelector('[role=dialog], .floating-menu')) return
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
          if (frame?.prompt?.text && !window.confirm(t('Remove this frame and its saved data?')))
            return
          s.removeFrame(s.selectedFrameId)
          const json = currentProjectJson()
          if (json && s.projectFolder) void window.sbr.saveProject(s.projectFolder, json)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

export function App(): JSX.Element {
  useFileDrop()
  const [home, setHome] = useState(false)
  const [introRun, setIntroRun] = useState(0)
  const [introActive, setIntroActive] = useState(shouldShowIntro)
  const finishIntro = useCallback(() => setIntroActive(false), [])
  const [searchLibrary, setSearchLibrary] = useState(false)
  const [panel, setPanel] = useState<'library' | 'settings' | null>(null)
  useEffect(() => {
    if (!useSettings.getState().value) void useSettings.getState().load()
  }, [])
  const scheme = useSettings((state) => state.value?.effectScheme ?? 'workspace')
  useEffect(() => {
    document.documentElement.dataset.effectScheme = scheme
  }, [scheme])
  const motionStyle = useSettings((state) => state.value?.motionStyle ?? 'standard')
  useEffect(() => {
    document.documentElement.dataset.motionStyle = motionStyle
  }, [motionStyle])
  const simplifyAnimations = useSettings((state) => state.value?.simplifyAnimations ?? false)
  useEffect(() => {
    document.documentElement.dataset.simplifyAnimations = String(simplifyAnimations)
  }, [simplifyAnimations])
  const language = useLanguage((s) => s.preference)
  const doc = useStore((s) => s.doc)
  useEffect(() => setHome(false), [doc?.id])
  const workspace = useStore((s) => s.workspace)
  const canUndo = useStore((s) => s.history.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const dirty = useStore((s) => s.dirty)
  const folder = useStore((s) => s.projectFolder)
  const markSaved = useStore((s) => s.markSaved)
  const visited = useRef<{ project: string; views: Set<string> }>({ project: '', views: new Set() })
  if (visited.current.project !== doc?.id)
    visited.current = { project: doc?.id ?? '', views: new Set() }
  visited.current.views.add(workspace)

  useAutosave()
  useKeyboard(!home && !introActive)
  useEffect(() => {
    if (home || workspace !== 'capture')
      document.querySelectorAll('video').forEach((video) => video.pause())
    document.querySelectorAll<HTMLElement>('.workspace-page').forEach((page) => {
      page.inert = page.classList.contains('inactive')
    })
  }, [workspace, doc?.id, home])

  const onSave = useCallback(async () => {
    const json = currentProjectJson()
    if (json && folder) {
      try {
        await window.sbr.saveProject(folder, json)
        markSaved(json)
        useStore.getState().toast(t('Project saved.'), 'success')
      } catch (error) {
        useStore
          .getState()
          .toast(t('Could not save project: {error}', { error: (error as Error).message }), 'error')
      }
    }
  }, [folder, markSaved])

  const goHome = async (): Promise<void> => {
    const state = useStore.getState()
    const json = currentProjectJson()
    try {
      if (state.dirty && state.projectFolder && json) {
        await window.sbr.saveProject(state.projectFolder, json)
        state.markSaved(json)
      }
      setPanel(null)
      setHome(true)
      setIntroRun((run) => run + 1)
      setIntroActive(true)
    } catch (error) {
      state.toast(t('Could not save project: {error}', { error: String(error) }), 'error')
    }
  }
  const introClass = introActive ? ' intro-revealing' : ''
  const introDuration = simplifyAnimations ? 'reduced' : useSettings.getState().value?.introDuration ?? 'full'

  const overlays = (
    <Fragment key="application-overlays">
      {introActive && <LaunchIntro key={introRun} onComplete={finishIntro} />}
      {panel && (
        <div
          key={panel}
          className="workspace-wipe overlay-wipe"
          data-title={panel === 'settings' ? 'SETTINGS' : 'PROJECT LIBRARY'}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
        </div>
      )}
      {panel === 'library' && (
        <ProjectLibrary searchInitiallyOpen={searchLibrary} onOpened={() => setHome(false)} onClose={() => setPanel(null)} />
      )}
      <LibTVUploads />
      {panel === 'settings' && <SettingsDialog onClose={() => setPanel(null)} />}
    </Fragment>
  )
  if (!doc || home) {
    return (
      <div className={`app welcome-app${introClass}`} data-intro-duration={introDuration} data-language={language}>
        <div className="titlebar">
          <span className="app-name">帧册 / FRAMEBOOK</span>
          <div className="spacer" />
          <TopAction icon="settings" label="Settings" onClick={() => setPanel('settings')} />
          <LanguageSelect />
        </div>
        <Welcome openLibrary={() => setPanel('library')} resume={doc ? () => setHome(false) : undefined} />
        {overlays}
        <Toasts />
        <HelpOverlay />
      </div>
    )
  }

  return (
    <div className={`app${introClass}`} data-intro-duration={introDuration} data-language={language}>
      <div className="titlebar">
        <span className="app-name">帧册 / FRAMEBOOK</span>
        <div className="project-identity">
          <ProjectName />
          <span className={`save-state ${dirty ? 'dirty' : ''}`} role="status">
            {t(dirty ? 'Unsaved changes' : 'Saved')}
          </span>
        </div>
        <div className="spacer" />
        <TopAction icon="home" label="Home" onClick={() => void goHome()} />
        <TopAction
          icon="undo"
          label="Undo"
          disabled={!canUndo}
          onClick={() => useStore.getState().undo()}
        />
        <TopAction
          icon="redo"
          label="Redo"
          disabled={!canRedo}
          onClick={() => useStore.getState().redo()}
        />
        <TopAction
          icon="library"
          label="Project library"
          onClick={() => {
            setSearchLibrary(false)
            setPanel('library')
          }}
        />
        <TopAction
          icon="search"
          label="Search projects"
          onClick={() => {
            setSearchLibrary(true)
            setPanel('library')
          }}
        />
        <TopAction icon="settings" label="Settings" onClick={() => setPanel('settings')} />
        <LanguageSelect />
        <TopAction icon="save" label="Save" onClick={onSave} />
        <TopAction icon="help" label="Help" onClick={() => useStore.getState().setHelpOpen(true)} />
      </div>
      <nav className="workspace-nav">
        {(['capture', 'gallery', 'storyboard', 'planning', 'callsheet'] as const).map(
          (value, index) => (
            <button
              key={value}
              className={workspace === value ? 'active' : ''}
              onClick={() => useStore.getState().setWorkspace(value)}
            >
              <span>0{index + 1}</span>
              {t(
                {
                  capture: 'Capture',
                  gallery: 'Frame gallery',
                  storyboard: 'Storyboard editor',
                  planning: 'Shooting plan',
                  callsheet: 'Call sheet'
                }[value]
              )}
            </button>
          )
        )}
        <span className="nav-note">
          FRAMEBOOK / {doc.frames.length} {t('frames')} / {doc.storyboard.shots.length} {t('shots')}
        </span>
      </nav>
      <div className="workspace-stack" key={doc.id} data-workspace={workspace}>
        <div
          className={`workspace-page ${workspace === 'capture' ? 'active' : 'inactive'}`}
          aria-hidden={workspace !== 'capture'}
        >
          <div
            className="capture-layout"
          >
            <DockLayout name="capture" panels={[
              {id:'media',title:'Media bin',content:<MediaBin />},
              {id:'viewer',title:'Preview',content:<Viewer />},
              {id:'inspector',title:'Frame settings',content:<Inspector />},
              {id:'frames',title:'Frames',content:<Board />}
            ]} />
          </div>
        </div>
        <div
          className={`workspace-page ${workspace === 'gallery' ? 'active' : 'inactive'}`}
          aria-hidden={workspace !== 'gallery'}
        >
          {visited.current.views.has('gallery') && <Gallery />}
        </div>
        <div
          className={`workspace-page ${workspace === 'storyboard' ? 'active' : 'inactive'}`}
          aria-hidden={workspace !== 'storyboard'}
        >
          {visited.current.views.has('storyboard') && <StoryboardEditor />}
        </div>
        {(['planning', 'callsheet'] as const).map((view) => (
          <div
            key={view}
            className={`workspace-page ${workspace === view ? 'active' : 'inactive'}`}
            aria-hidden={workspace !== view}
          >
            {visited.current.views.has(view) && <Production callSheet={view === 'callsheet'} />}
          </div>
        ))}
        <div
          key={workspace}
          className="workspace-wipe"
          data-scene={workspace}
          data-title={
            {
              capture: 'CAPTURE',
              gallery: 'GALLERY',
              storyboard: 'STORYBOARD',
              planning: 'SHOOTING PLAN',
              callsheet: 'CALL SHEET'
            }[workspace]
          }
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
        </div>
      </div>
      <Toasts />
      <HelpOverlay />
      <Present />
      {overlays}
    </div>
  )
}

function LanguageSelect(): JSX.Element {
  const { preference, change } = useLanguage()
  return (
    <label className="top-action language-action">
      <ActionLabel icon="language" label="Language" />
      <select
        className="language-select"
        aria-label={t('Language')}
        value={preference}
        onChange={(e) => change(e.target.value as typeof preference)}
      >
        <option value="system">{t('Follow system')}</option>
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  )
}

function ProjectName(): JSX.Element {
  const name = useStore((state) => state.doc?.name ?? '')
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const finish = async (next: string): Promise<void> => {
    if (busy) return
    setEditing(false)
    if (!next.trim() || next.trim() === name) return
    const state = useStore.getState()
    const json = currentProjectJson()
    if (!state.projectFolder || !json) return
    setBusy(true)
    try {
      const folder = await window.sbr.renameProject(state.projectFolder, next.trim(), json)
      state.mutate('rename project', (doc) => {
        doc.name = next.trim()
        doc.storyboard.title = next.trim()
      })
      useStore.setState({ projectFolder: folder, stills: {} })
      const saved = currentProjectJson()
      if (saved) state.markSaved(saved)
      state.toast(t('Project renamed.'), 'success')
    } catch (error) {
      state.toast(t('Operation failed: {error}', { error: String(error) }), 'error')
    } finally {
      setBusy(false)
    }
  }
  return editing ? (
    <input
      className="project-name-input"
      aria-label={t('Project name')}
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void finish(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setEditing(false)
        }
      }}
    />
  ) : (
    <button
      className="project-name project-name-edit"
      disabled={busy}
      title={t('Click to rename project')}
      onClick={() => {
        setValue(name)
        setEditing(true)
      }}
    >
      <span>{name}</span>
      <span className="name-edit-mark" aria-hidden="true">
        ↗
      </span>
    </button>
  )
}
