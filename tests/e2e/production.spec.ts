import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

test('v7 grouped planning, shared fields, search, call sheet and export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framebook-v7-'))
  mkdirSync(join(dir, '.app-data'), { recursive: true })
  writeFileSync(
    join(dir, '.app-data', 'settings.json'),
    JSON.stringify({ simplifyAnimations: true, introMode: 'off' })
  )
  const output = resolve('../outputs/framebook-2.5')
  mkdirSync(output, { recursive: true })
  const image = join(dir, 'reference.png')
  execFileSync(
    resolve('node_modules/ffmpeg-static/ffmpeg'),
    ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=180x320', '-frames:v', '1', image],
    { stdio: 'ignore' }
  )
  test.setTimeout(60000)
  const app = await electron.launch({
    args: process.env.SBR_TEST_APP ? [] : ['out/main/index.js'],
    executablePath: process.env.SBR_TEST_APP,
    env: { ...process.env, SBR_SMOKE_DIR: dir }
  })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error) => console.log('Renderer error:', error.message))
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800)
    )
    await page.locator('.language-select').selectOption('zh-CN')
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('蓝色仓库')
    await page.getByRole('dialog').getByRole('button', { name: '新建项目', exact: true }).click()
    await expect(page.locator('.workspace-nav')).toBeVisible()
    await page.evaluate(async (image) => {
      const s = window.__sbr.store.getState()
      const imported = await window.sbr.importMedia(s.projectFolder, image)
      const media = s.addMedia(imported)
      s.addFrame(media.id, 0, 'Warehouse')
      const current = window.__sbr.store.getState()
      current.addShots(
        current.doc.frames.map((f: any) => f.id),
        false
      )
      const old = JSON.parse(JSON.stringify(window.__sbr.store.getState().doc))
      old.version = 6
      old.production = {
        days: [
          {
            id: 'legacy',
            name: '仓库外景',
            date: '2026-10-29',
            location: '仓库',
            start: '09:00',
            finish: '',
            items: [],
            notice: {
              meeting: '09:00 仓库门口',
              personnel: '',
              equipment: '',
              emergency: '',
              notes: ''
            }
          }
        ],
        takes: [
          {
            id: 'take',
            dayId: 'legacy',
            itemId: 'old',
            number: 1,
            camera: 'A',
            filename: 'A001.mov',
            recorded: '',
            rating: 'good',
            notes: '',
            mediaIds: []
          }
        ]
      }
      if (!window.__sbr.store.getState().loadFromJson(s.projectFolder, JSON.stringify(old)))
        throw new Error('Migration failed')
    }, image)
    await page.locator('.workspace-nav button').filter({ hasText: '拍摄计划' }).click()
    await expect(page.locator('.plan-group')).toHaveCount(1)
    await page.getByRole('button', { name: /添加镜头/, exact: false }).click()
    await page.getByRole('dialog').locator('.search-control>button').click()
    await page.getByRole('textbox', { name: '搜索镜头' }).fill('1')
    await expect(page.getByRole('dialog').locator('.shot-picker-card img')).toHaveCount(1)
    await page.getByRole('dialog').locator('.shot-picker-card>button').first().click()
    await page.getByRole('button', { name: '添加镜头 (1)', exact: true }).click()
    await expect(page.locator('.plan-group tbody tr')).toHaveCount(1)
    await page
      .locator('.plan-group')
      .getByRole('textbox', { name: '内容', exact: true })
      .fill('航拍仓库外立面')
    expect(
      await page.evaluate(
        () => window.__sbr.store.getState().doc.storyboard.shots[0].cells.description
      )
    ).toBe('航拍仓库外立面')
    await page.getByRole('button', { name: '新建分组', exact: false }).click()
    await expect(page.locator('.plan-group')).toHaveCount(2)
    await page.locator('.plan-group').first().locator('tbody tr').hover()
    await page
      .locator('.plan-group')
      .first()
      .getByRole('button', { name: '镜头菜单', exact: true })
      .click()
    await page.getByRole('button', { name: /移至 场景 2/ }).click()
    await expect(page.locator('.plan-group').nth(1).locator('tbody tr')).toHaveCount(1)
    await page.evaluate(() => window.__sbr.store.getState().undo())
    await expect(page.locator('.plan-group').first().locator('tbody tr')).toHaveCount(1)
    await page.evaluate(() => window.__sbr.store.getState().redo())
    await page.screenshot({ path: join(output, 'layout-before.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '视图设置', exact: true }).click()
    await page.getByRole('button', { name: '管理列', exact: true }).click()
    await page.getByRole('dialog').getByRole('checkbox').nth(2).uncheck()
    await page.keyboard.press('Escape')
    await page.screenshot({ path: join(output, 'planning.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '导出…', exact: true }).click()
    await page.getByRole('button', { name: '预览 PDF', exact: true }).click()
    await expect(page.locator('.pdf-page-canvas').first()).toHaveAttribute('data-ready', 'true')
    await page.screenshot({ path: join(output, 'plan-preview.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await page.locator('.workspace-nav button').filter({ hasText: '拍摄通告' }).click()
    await expect(page.locator('.call-sheet-fields')).toBeVisible()
    await page.locator('.call-sheet-fields textarea').first().fill('09:30 仓库门口')
    await page.screenshot({ path: join(output, 'call-sheet.png'), animations: 'disabled' })
    await page.locator('.workspace-page.active .production-header select').selectOption('portrait')
    await page.getByRole('button', { name: '导出…', exact: true }).click()
    await page.getByRole('button', { name: '预览 PDF', exact: true }).click()
    await expect(page.locator('.pdf-page-canvas').first()).toHaveAttribute('data-ready', 'true')
    await page.screenshot({ path: join(output, 'call-sheet-preview.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')

    const saved = await page.evaluate(async () => {
      const s = window.__sbr.store.getState()
      await window.sbr.saveProject(s.projectFolder, JSON.stringify(s.doc))
      const json = (await window.sbr.loadProject(s.projectFolder)).json
      s.loadFromJson(s.projectFolder, json)
      return JSON.parse(json)
    })
    expect(saved.version).toBe(7)
    expect(saved.production.takes[0].filename).toBe('A001.mov')
    expect(saved.production.groups[1].items).toHaveLength(1)
    expect(saved.production.groups[0].notice.meeting).toBe('09:30 仓库门口')
    expect(saved.production.columns.find((c: any) => c.id === 'description').visible).toBe(false)
    await page.locator('.workspace-nav button').filter({ hasText: '截帧工作台' }).click()
    await page.screenshot({ path: join(output, 'media.png'), animations: 'disabled' })
    const sizes = [
      [1100, 700],
      [1440, 900],
      [1920, 1080]
    ]
    for (const [width, height] of sizes) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0]!.setContentSize(size[0]!, size[1]!),
        [width!, height!]
      )
      await expect
        .poll(() =>
          page.evaluate(() => ({
            width: document.querySelector('#root')!.getBoundingClientRect().width,
            height: document.querySelector('#root')!.getBoundingClientRect().height
          }))
        )
        .toEqual({ width, height })
    }
    await page.evaluate(() => {
      const s = window.__sbr.store.getState()
      s.setWorkspace('gallery')
      s.setWorkspace('storyboard')
      s.setWorkspace('planning')
    })
    await expect(page.locator('.workspace-page.active .plan-group')).toHaveCount(2)
  } finally {
    await app.close()
  }
})
