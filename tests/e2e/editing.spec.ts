import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

test('local PNG JPG HEIF imports, field conversion, templates and undo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framebook-editing-'))
  const png = join(dir, 'reference.png')
  const jpg = join(dir, 'reference.jpg')
  const heic = join(dir, 'reference.heic')
  const templateName = `Film study ${Date.now()}`
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=480x640', '-frames:v', '1', png], {
    stdio: 'ignore'
  })
  execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', png, '--out', jpg], { stdio: 'ignore' })
  execFileSync('/usr/bin/sips', ['-s', 'format', 'heic', png, '--out', heic], { stdio: 'ignore' })
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, SBR_SMOKE_DIR: dir }
  })
  try {
    const page = await app.firstWindow()
    await page.locator('.language-select').selectOption('en')
    await page.getByRole('button', { name: 'New Project', exact: true }).click()
    await app.evaluate(
      ({ dialog }, filePaths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths })
      },
      [png, jpg, heic]
    )
    await page
      .locator('.workspace-nav')
      .getByRole('button', { name: /Frame gallery/ })
      .click()
    await page.getByRole('button', { name: 'Import image', exact: true }).click()
    await expect(page.locator('.gallery-image img')).toHaveCount(3)
    const formats = await page.evaluate(() =>
      window.__sbr.store
        .getState()
        .doc.media.map((media: any) => ({
          source: media.sourceFile.split('.').pop(),
          working: media.workingFile.split('.').pop(),
          width: media.width,
          height: media.height
        }))
    )
    expect(formats.map((media: any) => media.source)).toEqual(['png', 'jpg', 'heic'])
    expect(
      formats.every((media: any) => media.working === 'png' && media.width === 480 && media.height === 640)
    ).toBe(true)
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    await page.getByRole('button', { name: 'Combine into one shot', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(3)
    await page.getByRole('button', { name: 'Add column', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('Mood references')
    await page.getByRole('dialog').getByRole('combobox').selectOption('image')
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, heic)
    const lastCell = page.locator('.story-table tbody tr td').nth(8)
    await lastCell.scrollIntoViewIfNeeded()
    await lastCell.getByRole('button', { name: 'Add image', exact: true }).click()
    await page.getByRole('button', { name: 'Import image', exact: true }).click()
    await expect(lastCell.locator('.story-cell-image img')).toHaveCount(1)
    expect(await page.evaluate(() => window.__sbr.store.getState().doc.frames.length)).toBe(3)
    await page.getByRole('button', { name: 'View settings', exact: true }).click()
    await page.getByRole('button', { name: 'Templates', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox').fill(templateName)
    await page.getByRole('button', { name: 'Save template', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Column menu: Mood references', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Edit column', exact: true }).click()
    await page.getByRole('dialog').getByRole('combobox').selectOption('text')
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await page.getByRole('dialog').getByRole('checkbox').check()
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(3)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(4)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(3)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await page.getByRole('button', { name: 'Column menu: Mood references', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Hide column', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(3)
    await page.getByRole('button', { name: 'View settings', exact: true }).click()
    await page.getByRole('button', { name: 'Templates', exact: true }).click()
    await page.getByRole('dialog').getByRole('combobox').selectOption({ label: templateName })
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(4)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect(
      await page.evaluate(async () => {
        const s = window.__sbr.store.getState()
        const saved = await window.sbr.loadProject(s.projectFolder)
        s.loadFromJson(s.projectFolder, saved.json)
        return window.__sbr.store.getState().doc.storyboard.shots.length
      })
    ).toBe(1)
  } finally {
    await app.close()
  }
})
