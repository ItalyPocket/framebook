import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

test('project library, recovery, media folders, duration and exact export previews', async () => {
  test.setTimeout(180_000)
  const dir = mkdtempSync(join(tmpdir(), 'framebook-23-'))
  const outputs = join(process.cwd(), '../outputs/ui-2.3')
  mkdirSync(outputs, { recursive: true })
  const source = join(dir, 'portrait.png')
  execFileSync(
    process.env.SBR_TEST_FFMPEG ?? 'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=180x320', '-frames:v', '1', source],
    { stdio: 'ignore' }
  )
  const app = await electron.launch({
    executablePath: process.env.FRAMEBOOK_EXECUTABLE,
    args: process.env.FRAMEBOOK_EXECUTABLE ? [] : ['out/main/index.js'],
    env: { ...process.env, SBR_SMOKE_DIR: dir }
  })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.locator('.language-select').selectOption('zh-CN')
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Portable')
    await page.getByRole('dialog').getByRole('button', { name: '新建项目', exact: true }).click()
    await expect(page.locator('.workspace')).toBeVisible()
    const initial = await page.evaluate(
      async ({ dir, source }) => {
        const api = window.sbr
        const settings = await api.getSettings()
        await api.setSettings({
          autosave: false,
          framesRoot: `${dir}/frames-export`,
          storyboardRoot: `${dir}/board-export`
        })
        const state = window.__sbr.store.getState()
        const media = state.addMedia(await api.importMedia(state.projectFolder, source))
        const frame = state.addFrame(media.id, 0, 'Portable image')
        state.addShots([frame.id], false)
        state.addShots([], false)
        const latest = window.__sbr.store.getState()
        latest.setWorkspace('storyboard')
        return {
          settings,
          folder: latest.projectFolder,
          mediaId: media.id,
          shotId: latest.doc.storyboard.shots[0].id
        }
      },
      { dir, source }
    )
    expect(initial.settings.backupLimit).toBe(5)
    expect(initial.settings.simplifyAnimations).toBe(false)
    await expect(page.locator('.storyboard-status')).toContainText('已填写: 0/2')
    await page.locator('.story-table tbody tr').first().hover()
    await page.getByRole('button', { name: '由入／出点计算', exact: true }).first().click()
    await expect(page.getByRole('dialog')).toContainText('请填写入点与出点')
    await expect(
      page.getByRole('dialog').getByRole('button', { name: '应用', exact: true })
    ).toBeDisabled()
    await page.getByLabel('入点（秒）', { exact: true }).fill('2')
    await page.getByLabel('出点（秒）', { exact: true }).fill('65.5')
    await page.getByRole('dialog').getByRole('button', { name: '应用', exact: true }).click()
    await expect(page.locator('.storyboard-status')).toContainText('总时长: 1:03.5')
    await page.evaluate(() => {
      const state = window.__sbr.store.getState()
      state.updateStoryColumn('duration', { visible: false })
      state.undo()
    })
    await page.getByRole('button', { name: '添加表头', exact: true }).click()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: '焦段', exact: true })
    ).toHaveCount(0)
    await page.getByRole('dialog').getByRole('button', { name: '参考画面', exact: true }).click()
    await page.evaluate(() => window.__sbr.store.getState().removeStoryColumn('duration'))
    await expect(page.locator('.storyboard-status')).not.toContainText('总时长')
    await page.evaluate(() => window.__sbr.store.getState().undo())
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'storyboard.png') })
    const backups = await page.evaluate(async () => {
      const state = window.__sbr.store.getState()
      for (let index = 0; index < 8; index++) {
        state.updateStoryCell(state.doc.storyboard.shots[0].id, 'description', `version ${index}`)
        await window.sbr.saveProject(
          state.projectFolder,
          JSON.stringify(window.__sbr.store.getState().doc)
        )
      }
      return await window.sbr.listBackups(state.projectFolder)
    })
    expect(backups).toHaveLength(5)
    expect(existsSync(join(initial.folder, '.autosave', backups[0].file, 'media'))).toBe(false)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('checkbox', { name: '简化动画', exact: true }).check()
    await expect(page.locator('html')).toHaveAttribute('data-simplify-animations', 'true')
    expect(
      await page.evaluate(async () => (await window.sbr.getSettings()).simplifyAnimations)
    ).toBe(true)
    await page.getByRole('checkbox', { name: '简化动画', exact: true }).uncheck()
    await expect(page.locator('html')).toHaveAttribute('data-simplify-animations', 'false')
    await page.evaluate(() => {
      const state = window.__sbr.store.getState()
      state.setWorkspace('gallery')
      state.setWorkspace('capture')
      state.setWorkspace('storyboard')
    })
    expect(
      await page
        .locator('.workspace-page.active')
        .evaluate((element) => getComputedStyle(element).transitionDuration)
    ).toContain('0.28s')
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'settings.png') })
    await page.getByRole('spinbutton', { name: '自动保存间隔（秒，至少 10 秒）' }).fill('10')
    await page.getByRole('spinbutton', { name: '自动保存间隔（秒，至少 10 秒）' }).blur()
    await expect
      .poll(() => page.evaluate(async () => (await window.sbr.getSettings()).autosaveSeconds))
      .toBe(10)
    await page.getByRole('checkbox', { name: '开启自动保存', exact: true }).check()
    await page.getByRole('button', { name: '项目设置', exact: true }).click()
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'project-settings.png') })
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await page.evaluate(() => {
      const state = window.__sbr.store.getState()
      state.updateStoryCell(state.doc.storyboard.shots[0].id, 'description', 'Autosave verified')
    })
    await expect
      .poll(
        () =>
          JSON.parse(readFileSync(join(initial.folder, 'project.json'), 'utf8')).storyboard.shots[0]
            .cells.description,
        { timeout: 15000 }
      )
      .toBe('Autosave verified')
    await page.evaluate(() => window.__sbr.store.getState().setWorkspace('capture'))
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click()
    await page.getByLabel('文件夹名称').fill('References')
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await page.locator('.bin-item').first().click()
    await page.getByLabel('移入文件夹').selectOption({ label: 'References' })
    await page.locator('.media-folder').click()
    await expect(page.locator('.bin-item')).toHaveCount(1)
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'media-library.png') })
    const portability = await page.evaluate(
      async ({ source }) => {
        const state = window.__sbr.store.getState()
        await window.sbr.setSettings({ copyMedia: false })
        const imported = await window.sbr.importMedia(state.projectFolder, source)
        const media = state.addMedia(imported)
        const json = JSON.stringify(window.__sbr.store.getState().doc)
        await window.sbr.saveProject(state.projectFolder, json)
        const loaded = await window.sbr.loadProject(state.projectFolder)
        const before = JSON.parse(loaded.json).media.find((item: any) => item.id === media.id)
        const renamed = await window.sbr.renameProject(state.projectFolder, 'Renamed', loaded.json)
        state.loadFromJson(renamed, (await window.sbr.loadProject(renamed)).json)
        return { before, renamed, entries: await window.sbr.listProjects() }
      },
      { source }
    )
    expect(portability.before.externalPath).toBe(source)
    expect(portability.renamed).toContain('Renamed.sbref')
    expect(portability.entries.some((entry: any) => entry.name === 'Renamed')).toBe(true)
    const exportResult = await page.evaluate(
      async ({ dir }) => {
        const state = window.__sbr.store.getState()
        const media = state.doc.media[0]
        const path = `${state.projectFolder}/.frames/test.png`
        await window.sbr.ensureDir(`${state.projectFolder}/.frames`)
        const extracted = await window.sbr.extractFrame(state.mediaAbsPath(media.id), 0, path)
        if (!extracted.ok) throw new Error(extracted.error)
        const frame = {
          sourcePng: path,
          label: 'Test',
          notes: '',
          promptText: '',
          profileId: '',
          crop: null,
          sourceWidth: 180,
          sourceHeight: 320,
          timeS: 0,
          mediaName: 'portrait.png'
        }
        const columns = state.doc.storyboard.columns.filter((column: any) =>
          ['shotNo', 'image', 'description', 'duration'].includes(column.id)
        )
        const shots = [
          {
            id: 'pdf-shot',
            cells: {
              shotNo: 1,
              duration: 63.5,
              description: 'Long text '.repeat(900) + 'END_OF_CONTENT'
            },
            startS: null,
            endS: null,
            rendered: Array(9).fill(frame),
            imageRoles: Array(9).fill('Reference')
          }
        ]
        const request = {
          projectName: '广告片/测试',
          title: 'Pagination test',
          description: '',
          exportsRoot: dir,
          columns,
          shots,
          language: 'en',
          layout: 'table',
          orientation: 'portrait',
          kind: 'pdf'
        }
        const preview = await window.sbr.preparePreview({ storyboard: request })
        const bytes = Array.from(preview.pdf)
        const pdf = await window.sbr.confirmPreview(preview.id)
        const landscape = await window.sbr.preparePreview({
          storyboard: { ...request, orientation: 'landscape' }
        })
        const landscapePath = await window.sbr.confirmPreview(landscape.id)
        const csv = await window.sbr.preparePreview({ storyboard: { ...request, kind: 'csv' } })
        await window.sbr.cancelPreview(csv.id)
        const frames = await window.sbr.preparePreview({
          frames: { projectName: state.doc.name, exportsRoot: dir, frames: [frame] },
          format: 'png'
        })
        const framesPath = await window.sbr.confirmPreview(frames.id)
        return { pdf, bytes, landscapePath, csv: csv.rows, framesPath }
      },
      { dir }
    )
    expect(exportResult.pdf).toContain('广告片-测试分镜本.pdf')
    expect(Array.from(readFileSync(exportResult.pdf))).toEqual(exportResult.bytes)
    expect(readFileSync(exportResult.pdf).subarray(0, 4).toString()).toBe('%PDF')
    expect(exportResult.csv).toContain('END_OF_CONTENT')
    expect(existsSync(join(exportResult.framesPath, '001.png'))).toBe(true)
    await page.evaluate(() => window.__sbr.store.getState().setWorkspace('storyboard'))
    await page.getByRole('button', { name: '导出…', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'PDF 分镜本', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('确认导出')
    await expect(page.locator('.pdf-page-canvas canvas')).toBeVisible()
    await expect(page.locator('.dialog-exit')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
    await expect(page.locator('.pdf-page-canvas')).toHaveAttribute('data-ready', 'true')
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'pdf-preview.png') })
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1100, 700)
    )
    await expect(page.locator('.storyboard-status')).toBeVisible()
    await expect(page.locator('.dialog-exit')).toHaveCount(0)
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'storyboard-1100.png') })
    await page.locator('.project-name-edit').click()
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Inline rename')
    await page.getByRole('textbox', { name: '项目名称', exact: true }).press('Enter')
    await expect(page.locator('.project-name-edit')).toContainText('Inline rename')
    const renamedDoc = await page.evaluate(async () => {
      const state = window.__sbr.store.getState()
      return JSON.parse((await window.sbr.loadProject(state.projectFolder)).json)
    })
    expect(renamedDoc.name).toBe('Inline rename')
    expect(renamedDoc.storyboard.title).toBe('Inline rename')
    await expect(page.locator('#root')).not.toHaveAttribute('inert')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '项目设置', exact: true }).click()
    await page.getByRole('button', { name: '恢复副本', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.locator('#root')).not.toHaveAttribute('inert')
    const zip = join(dir, 'portable.zip')
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, zip)
    await page.evaluate(async () => {
      const state = window.__sbr.store.getState()
      await window.sbr.shareProject(state.projectFolder, JSON.stringify(state.doc))
    })
    execFileSync('/usr/bin/ditto', ['-x', '-k', zip, join(dir, 'unpacked')])
    const packed = JSON.parse(
      readFileSync(join(dir, 'unpacked', 'Inline rename.sbref', 'project.json'), 'utf8')
    )
    expect(packed.media.every((media: any) => !media.externalPath)).toBe(true)
    expect(
      packed.media.every((media: any) =>
        existsSync(join(dir, 'unpacked', 'Inline rename.sbref', media.sourceFile))
      )
    ).toBe(true)
    await page.getByRole('button', { name: '项目库', exact: true }).click()
    await expect(page.locator('.dialog-exit')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
    await expect(page.locator('.project-card')).toContainText('Inline rename')
    await page.screenshot({ animations: 'disabled', path: join(outputs, 'project-library.png') })
    await page.keyboard.press('Escape')
    expect(errors).toEqual([])
    console.log(
      JSON.stringify({ dir, pdf: exportResult.pdf, landscape: exportResult.landscapePath })
    )
  } finally {
    await app.close()
  }
})
