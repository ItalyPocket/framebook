import { SearchControl } from './SearchControl'
import { useEffect, useState } from 'react'
import { parseProject } from '@shared/schema'
import { t } from '@shared/i18n'
import type { AppSettings, ProjectEntry, RecoveryEntry } from '@shared/workspace'
import { useStore, currentProjectJson } from '../store'
import { useSettings } from '../settings'
import { Dialog } from './Controls'

export function SettingsDialog({ onClose }: { onClose(): void }): JSX.Element {
  const [tab, setTab] = useState<'general' | 'project'>('general')
  const doc = useStore((state) => state.doc)
  const folder = useStore((state) => state.projectFolder)
  const [recovering, setRecovering] = useState(false)
  const value = useSettings((state) => state.value)
  const update = useSettings((state) => state.update)
  const [error, setError] = useState('')
  const change = (patch: Partial<AppSettings>): void => {
    void update(patch).catch((reason) => setError(String(reason)))
  }
  const path = (
    key: 'projectRoot' | 'storyboardRoot' | 'framesRoot',
    label: string
  ): JSX.Element => (
    <label className="field">
      {t(label)}
      <div className="path-setting">
        <input readOnly value={value?.[key] ?? ''} />
        <button
          className="btn"
          onClick={async () => {
            const folder = await window.sbr.chooseDirectory()
            if (folder) change({ [key]: folder })
          }}
        >
          {t('Choose folder')}
        </button>
      </div>
    </label>
  )
  const check = (
    key: 'autosave' | 'copyMedia' | 'askStoryboard' | 'askFrames' | 'simplifyAnimations',
    label: string
  ): JSX.Element => (
    <label className="setting-check">
      <input
        type="checkbox"
        checked={value?.[key] ?? false}
        onChange={(event) => change({ [key]: event.target.checked })}
      />
      {t(label)}
    </label>
  )
  return (
    <Dialog title={t('Settings')} onClose={onClose} wide>
      <nav className="settings-tabs">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
          {t('General settings')}
        </button>
        <button className={tab === 'project' ? 'active' : ''} onClick={() => setTab('project')}>
          {t('Project settings')}
        </button>
      </nav>
      <div key={tab} className="settings-page">
        {tab === 'general' && value && (
          <div className="settings-grid">
            <section>
              <h3>{t('Appearance and motion')}</h3>
              <label className="field">
                {t('Motion style')}
                <select
                  value={value.motionStyle}
                  onChange={(event) =>
                    change({ motionStyle: event.target.value as 'standard' | 'cinematic' })
                  }
                >
                  <option value="standard">{t('Standard · 800ms')}</option>
                  <option value="cinematic">{t('Cinematic · 1200ms')}</option>
                </select>
              </label>
              <label className="field">
                {t('Effect scheme')}
                <select
                  value={value.effectScheme}
                  onChange={(event) =>
                    change({ effectScheme: event.target.value as AppSettings['effectScheme'] })
                  }
                >
                  <option value="unified">{t('Unified')}</option>
                  <option value="workspace">{t('Per workspace')}</option>
                </select>
              </label>
              <label className="field">
                {t('Launch intro')}
                <select
                  value={value.introMode}
                  onChange={(event) =>
                    change({ introMode: event.target.value as AppSettings['introMode'] })
                  }
                >
                  <option value="off">{t('Off')}</option>
                  <option value="daily">{t('First launch each day')}</option>
                  <option value="always">{t('Every launch')}</option>
                </select>
              </label>
              <label className="field">
                {t('Intro duration')}
                <select
                  value={value.introDuration}
                  onChange={(event) =>
                    change({ introDuration: event.target.value as AppSettings['introDuration'] })
                  }
                >
                  <option value="short">{t('Short · 800ms')}</option>
                  <option value="full">{t('Full · 3 seconds')}</option>
                </select>
              </label>
              {check('simplifyAnimations', 'Simplify animations')}
              <p className="hint">{t('Use short fades instead of geometric motion.')}</p>
              <h3>{t('Projects and saving')}</h3>
              {path('projectRoot', 'Default project location')}
              {check('autosave', 'Enable autosave')}
              <label className="field">
                {t('Autosave interval (seconds)')}
                <input
                  type="number"
                  min="10"
                  key={`interval-${value.autosaveSeconds}`}
                  defaultValue={value.autosaveSeconds}
                  onBlur={(event) => change({ autosaveSeconds: Number(event.target.value) })}
                />
              </label>
              <label className="field">
                {t('Recovery copies')}
                <input
                  type="number"
                  min="1"
                  key={`backups-${value.backupLimit}`}
                  defaultValue={value.backupLimit}
                  onBlur={(event) => change({ backupLimit: Number(event.target.value) })}
                />
              </label>
              <p className="hint">
                {t('Recovery copies contain project data only, without media.')}
              </p>
            </section>
            <section>
              <h3>{t('Export settings')}</h3>
              {path('storyboardRoot', 'Storyboard export location')}
              {check('askStoryboard', 'Ask for storyboard export location each time')}
              {path('framesRoot', 'Frame export location')}
              {check('askFrames', 'Ask for frame export location each time')}
              <h3>{t('Media storage')}</h3>
              {check('copyMedia', 'Copy imported media into project')}
              <p className="hint">
                {t(
                  'Applies to future imports. Referenced files must remain available at their original location.'
                )}
              </p>
            </section>
          </div>
        )}
        {tab === 'project' &&
          (doc && folder ? (
            <section className="project-settings-content">
              <h3>{doc.name}</h3>
              <p className="hint">
                {t('Rename the project by clicking its name in the top left.')}
              </p>
              <label className="field">
                {t('Project location')}
                <div className="path-setting">
                  <input readOnly value={folder} />
                  <button className="btn" onClick={() => void window.sbr.showFolder(folder)}>
                    {t('Show in Finder')}
                  </button>
                </div>
              </label>
              <label className="field">
                {t('Storyboard title')}
                <input
                  value={doc.storyboard.title}
                  onChange={(event) =>
                    useStore.getState().mutate('edit storyboard title', (project) => {
                      project.storyboard.title = event.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                {t('Description')}
                <textarea
                  rows={3}
                  value={doc.storyboard.description}
                  onChange={(event) =>
                    useStore.getState().mutate('edit storyboard description', (project) => {
                      project.storyboard.description = event.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                {t('Gallery sorting')}
                <select
                  value={doc.settings.gallerySort}
                  onChange={(event) => {
                    if (event.target.value === 'time') useStore.getState().sortGallery()
                    else
                      useStore.getState().mutate('manual gallery sorting', (project) => {
                        project.settings.gallerySort = 'manual'
                      })
                  }}
                >
                  <option value="time">{t('Source time')}</option>
                  <option value="manual">{t('Manual order')}</option>
                </select>
              </label>
              <div className="project-settings-actions">
                <button className="btn" onClick={() => setRecovering(true)}>
                  {t('Recovery copies')}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const json = currentProjectJson()
                    if (json)
                      void window.sbr
                        .shareProject(folder, json)
                        .then((path) => {
                          if (path) useStore.getState().toast(t('Export complete.'), 'success')
                        })
                        .catch((reason) => setError(String(reason)))
                  }}
                >
                  {t('Package project (ZIP)')}
                </button>
              </div>
            </section>
          ) : (
            <p>{t('Open a project to change its settings.')}</p>
          ))}
      </div>
      {recovering && <RecoveryDialog onClose={() => setRecovering(false)} />}
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
    </Dialog>
  )
}

export function ProjectLibrary({
  onClose,
  searchInitiallyOpen = false
}: {
  onClose(): void
  searchInitiallyOpen?: boolean
}): JSX.Element {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.sbr
      .listProjects()
      .then(setProjects)
      .catch((reason) => setError(String(reason)))
  }, [])
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const state = useStore.getState()
      const json = currentProjectJson()
      if (state.dirty && state.projectFolder && json) {
        await window.sbr.saveProject(state.projectFolder, json)
        state.markSaved(json)
      }
      await operation()
      onClose()
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  const open = async (folder: string): Promise<void> => {
    const result = await window.sbr.loadProject(folder)
    const json = result.backupNewer ? result.backupJson : (result.json ?? result.backupJson)
    if (!json || !useStore.getState().loadFromJson(folder, json))
      throw new Error(t('Could not open project'))
    if (result.backupNewer) useStore.setState({ dirty: true })
  }
  return (
    <Dialog title={t('Project library')} onClose={onClose} wide>
      <div className="library-actions">
        <input
          aria-label={t('Project name')}
          placeholder={t('Project name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="btn primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            void run(async () => {
              const folder = await window.sbr.createProject(name.trim())
              useStore.getState().newProject(folder, name.trim())
              const json = currentProjectJson()
              if (json) {
                await window.sbr.saveProject(folder, json)
                useStore.getState().markSaved(json)
              }
            })
          }
        >
          {t('New Project')}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const folder = await window.sbr.openProjectDialog()
              if (folder) await open(folder)
            })
          }
        >
          {t('Import existing project')}
        </button>
      </div>
      <SearchControl
        initiallyOpen={searchInitiallyOpen}
        label="Search projects"
        value={search}
        onChange={setSearch}
      />
      <div className="project-library">
        {projects
          .filter((project) =>
            project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
          )
          .map((project) => (
            <button
              className="project-card"
              disabled={busy}
              key={project.folder}
              onClick={() => void run(() => open(project.folder))}
            >
              {project.cover ? (
                <img src={project.cover} alt="" />
              ) : (
                <span className="project-cover">◩</span>
              )}
              <strong>{project.name}</strong>
              <span>
                {project.shots} {t('shots')} · {new Date(project.modified).toLocaleDateString()}
              </span>
            </button>
          ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </Dialog>
  )
}

export function RecoveryDialog({ onClose }: { onClose(): void }): JSX.Element {
  const folder = useStore((state) => state.projectFolder)
  const [entries, setEntries] = useState<RecoveryEntry[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (folder)
      void window.sbr
        .listBackups(folder)
        .then(setEntries)
        .catch((reason) => setError(String(reason)))
  }, [folder])
  return (
    <Dialog title={t('Recovery copies')} onClose={onClose}>
      <p>{t('Restoring a copy can be undone. Save to keep the restored version.')}</p>
      {entries.map((entry) => (
        <button
          className="btn recovery-entry"
          key={entry.file}
          onClick={async () => {
            try {
              if (!folder) return
              const { doc } = parseProject(await window.sbr.readBackup(folder, entry.file))
              if (!doc) throw new Error(t('Could not open project'))
              useStore
                .getState()
                .mutate('restore recovery copy', (current) => Object.assign(current, doc))
              useStore.setState({ stills: {} })
              onClose()
            } catch (reason) {
              setError(String(reason))
            }
          }}
        >
          {new Date(entry.modified).toLocaleString()}
        </button>
      ))}
      {!entries.length && <p>{t('No recovery copies yet.')}</p>}
      {error && <p role="alert">{error}</p>}
    </Dialog>
  )
}
