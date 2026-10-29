import { t } from '@shared/i18n'

import { useCallback, useEffect } from 'react'
import { useStore, currentProjectJson } from '../store'
import { useAbsUrl } from '../lib/useMediaUrl'
import { CropEditor } from './CropEditor'
import { ensureStill } from '../lib/frameOps'
import { SHOT_SIZES, CAMERA_ANGLES, MOVEMENTS, TRANSITIONS } from '@shared/profiles'
import { CROP_ASPECTS, fullCropSafe } from '../lib/inspectorHelpers'
import { ANNOTATION_COLORS } from '@shared/annotations'
import type { CropAspect } from '@shared/types'

export function Inspector(): JSX.Element {
  const frameId = useStore((s) => s.selectedFrameId)
  const frame = useStore((s) => s.frame(frameId))
  const folder = useStore((s) => s.projectFolder)
  const still = useStore((s) => (frameId ? s.stills[frameId] : undefined))

  const setFrameLabel = useStore((s) => s.setFrameLabel)
  const setFrameNotes = useStore((s) => s.setFrameNotes)
  const setFrameCrop = useStore((s) => s.setFrameCrop)
  const setFrameCropAspect = useStore((s) => s.setFrameCropAspect)
  const setFrameDuration = useStore((s) => s.setFrameDuration)
  const setFrameShot = useStore((s) => s.setFrameShot)
  const clearAnnotations = useStore((s) => s.clearAnnotations)
  const annotTool = useStore((s) => s.annotTool)
  const setAnnotTool = useStore((s) => s.setAnnotTool)
  const annotColor = useStore((s) => s.annotColor)
  const setAnnotColor = useStore((s) => s.setAnnotColor)

  const stillUrl = useAbsUrl(still?.path ?? null)

  // Ensure a still exists when a frame is opened (for the crop editor).
  useEffect(() => {
    if (frameId && !still) void ensureStill(frameId)
  }, [frameId, still])

  const save = useCallback(async () => {
    const json = currentProjectJson()
    if (json && folder) await window.sbr.saveProject(folder, json)
  }, [folder])

  if (!frame) {
    return (
      <div className="inspector-col panel">
        <div className="inspector-empty">{t("Select a frame to edit its label, crop and shot details.")}</div>
      </div>
    )
  }

  const crop = frame.crop
  const onAspect = (aspect: CropAspect | null): void => {
    if (aspect === null) {
      setFrameCrop(frame.id, null)
    } else if (!crop) {
      setFrameCrop(frame.id, fullCropSafe(aspect, still?.width ?? 16, still?.height ?? 9))
    } else {
      setFrameCropAspect(frame.id, aspect)
    }
    void save()
  }

  return (
    <div className="inspector-col panel">
      <div className="inspector-still-wrap">
        {stillUrl ? (
          <img className="inspector-still" src={stillUrl} alt={t("frame still")} />
        ) : (
          <div className="inspector-still" />
        )}
        {crop && still && stillUrl && (
          <CropEditor frameId={frame.id} crop={crop} imgW={still.width} imgH={still.height} />
        )}
      </div>

      <div className="panel-section">
        <div className="field">
          <label>{t("Label")}</label>
          <input
            type="text"
            value={frame.label}
            placeholder={t("SHOT 1A — HERO ENTERS")}
            onChange={(e) => setFrameLabel(frame.id, e.target.value)}
            onBlur={save}
          />
        </div>
        <div className="field">
          <label>{t("Notes")}</label>
          <textarea value={frame.notes} onChange={(e) => setFrameNotes(frame.id, e.target.value)} onBlur={save} />
        </div>
        <div className="field">
          <label>{t("Duration (s)")}</label>
          <input
            type="number"
            min={0.25}
            max={30}
            step={0.25}
            value={frame.durationS}
            onChange={(e) => setFrameDuration(frame.id, Number(e.target.value))}
            onBlur={save}
          />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">{t("Shot")}</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("Scene")}</label>
            <input type="text" value={frame.shot.sceneNo} onChange={(e) => setFrameShot(frame.id, { sceneNo: e.target.value })} onBlur={save} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("Shot")}</label>
            <input type="text" value={frame.shot.shotNo} onChange={(e) => setFrameShot(frame.id, { shotNo: e.target.value })} onBlur={save} />
          </div>
        </div>
        <ShotSelect label={t("Size")} options={SHOT_SIZES} value={frame.shot.shotSize} onChange={(v) => { setFrameShot(frame.id, { shotSize: v }); void save() }} />
        <ShotSelect label={t("Angle")} options={CAMERA_ANGLES} value={frame.shot.cameraAngle} onChange={(v) => { setFrameShot(frame.id, { cameraAngle: v }); void save() }} />
        <div className="field">
          <label>{t("Lens")}</label>
          <input type="text" value={frame.shot.lens} placeholder={t("e.g. 35mm")} onChange={(e) => setFrameShot(frame.id, { lens: e.target.value })} onBlur={save} />
        </div>
        <ShotSelect label={t("Movement")} options={MOVEMENTS} value={frame.shot.movement} onChange={(v) => { setFrameShot(frame.id, { movement: v }); void save() }} />
        <ShotSelect label={t("Transition")} options={TRANSITIONS} value={frame.shot.transition} onChange={(v) => { setFrameShot(frame.id, { transition: v }); void save() }} />
      </div>

      <div className="panel-section">
        <div className="panel-title">{t("Annotate")}</div>
        <div className="hint" style={{ marginBottom: 8 }}>
          {t("Draw camera-move arrows or action text on the stage. Pick a tool, then drag (arrow) or click (text).")}</div>
        <div className="seg" style={{ marginBottom: 8 }}>
          <button className={annotTool === 'arrow' ? 'active' : ''} onClick={() => setAnnotTool(annotTool === 'arrow' ? 'none' : 'arrow')}>{t("↗ Arrow")}</button>
          <button className={annotTool === 'text' ? 'active' : ''} onClick={() => setAnnotTool(annotTool === 'text' ? 'none' : 'text')}>{t("T Text")}</button>
        </div>
        <div className="anno-swatches">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              className={`anno-swatch ${annotColor === c ? 'sel' : ''}`}
              style={{ background: c }}
              onClick={() => setAnnotColor(c)}
              title={c}
            />
          ))}
          <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => { clearAnnotations(frame.id); void save() }} disabled={frame.annotations.length === 0}>
            {t("Clear")}</button>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">{t("Reframe")}</div>
        <div className="seg">
          <button className={!crop ? 'active' : ''} onClick={() => onAspect(null)}>{t('none')}</button>
          {CROP_ASPECTS.map((a) => (
            <button key={a} className={crop?.aspect === a ? 'active' : ''} onClick={() => onAspect(a)}>
              {t(a)}
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          {crop ? 'Drag the overlay to reframe. The crop is applied full-res on export.' : 'Pick an aspect to add a crop overlay.'}
        </div>
      </div>

    </div>
  )
}

function ShotSelect({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{t(o)}</option>
        ))}
      </select>
    </div>
  )
}
