import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

test('responsive workspaces, contextual controls, typed fields and independent image columns', async () => {
  test.setTimeout(90_000)
  const dir = mkdtempSync(join(tmpdir(), 'framebook-ui-'))
  const outputs = join(process.cwd(), '../outputs/ui-2.2')
  mkdirSync(outputs, { recursive: true })
  for (const [name, size, color] of [
    ['landscape', '640x360', 'blue'],
    ['portrait', '360x640', 'green']
  ]) {
    execFileSync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}`, '-frames:v', '1', join(dir, `${name}.png`)],
      { stdio: 'ignore' }
    )
  }
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, SBR_SMOKE_DIR: dir }
  })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.locator('.language-select').selectOption('zh-CN')
    await expect(page.locator('.art-orbit')).toHaveCSS('animation-name', 'orbit-drift')
    await page.getByRole('button', { name: '新建项目', exact: true }).hover()
    await expect(page.locator('.art-link-layer')).toBeVisible()
    await page.screenshot({ path: join(outputs, 'welcome-hover.png') })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.art-orbit')).toHaveCSS('animation-name', 'none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    for (const [width, height] of [
      [1100, 700],
      [1280, 800],
      [1440, 900],
      [1920, 1080]
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isVisible())!
            .setContentSize(width, height),
        { width, height }
      )
      const actions = await page.locator('.welcome .actions').boundingBox()
      expect(actions!.x).toBeGreaterThanOrEqual(0)
      expect(actions!.x + actions!.width).toBeLessThanOrEqual(width)
      await page.screenshot({ path: join(outputs, `welcome-${width}.png`) })
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isVisible())!
        .setContentSize(1600, 992)
    )
    await page.locator('.welcome-title').hover()
    await page.screenshot({ path: join(outputs, 'welcome.png') })
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Smoke')
    await page.getByRole('dialog').getByRole('button', { name: '新建项目', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('已保存')
    await page.evaluate(
      async ({ dir }) => {
        const s = window.__sbr.store.getState()
        for (const name of ['landscape', 'portrait']) {
          const media = s.addMedia(await window.sbr.importMedia(s.projectFolder, `${dir}/${name}.png`))
          s.addFrame(media.id, 0, name)
        }
      },
      { dir }
    )
    await page
      .locator('.workspace-nav')
      .getByRole('button', { name: /静帧画廊/ })
      .click()
    await expect(page.locator('.gallery-image img')).toHaveCount(2)
    await page.getByLabel('缩略图大小').selectOption('340')
    await page.getByRole('button', { name: '全选', exact: true }).click()
    await page.screenshot({ path: join(outputs, 'gallery.png') })
    await page.getByRole('button', { name: '合并为一个多图镜头', exact: true }).click()
    await expect(page.locator('.story-cell-image img')).toHaveCount(2)
    const row = page.locator('.story-table tbody tr').first()
    await row
      .getByRole('textbox', { name: '内容', exact: true })
      .fill('主角走入画面。\n保留多行内容与清晰的阅读顺序。')
    await page.getByRole('button', { name: '添加表头', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('参考图片')
    await page.getByRole('dialog').getByRole('combobox').selectOption('image')
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    const secondary = row
      .locator('td')
      .filter({ has: page.getByRole('button', { name: '添加图片', exact: true }) })
      .last()
    await secondary.scrollIntoViewIfNeeded()
    await secondary.getByRole('button', { name: '添加图片', exact: true }).click()
    await page.getByRole('button', { name: '从静帧画廊导入', exact: true }).click()
    await page.getByRole('dialog').getByRole('checkbox').first().check()
    await page.getByRole('dialog').getByRole('button', { name: '添加图片', exact: true }).click()
    await expect(secondary.locator('.story-cell-image')).toHaveCount(1)
    expect(
      await page.evaluate(() => {
        const b = window.__sbr.store.getState().doc.storyboard
        return b.columns.filter((c: any) => c.type === 'image').map((c: any) => b.shots[0].cells[c.id].length)
      })
    ).toEqual([2, 1])
    await secondary.getByRole('button', { name: '预览图片' }).click()
    await expect(page.locator('.large-preview img')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('.story-table-scroll').evaluate((element) => {
      element.scrollLeft = 0
    })
    const menu = page.getByRole('button', { name: /列菜单: 景别/ })
    await page.locator('.section-header h1').hover()
    await expect(menu).toHaveCSS('opacity', '0')
    await menu.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: '编辑列', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox').last().fill('全景\n中景\n自定义景别')
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    const choice = row
      .locator('td')
      .filter({ has: page.getByRole('button', { name: '选择…', exact: true }) })
      .first()
    await choice.scrollIntoViewIfNeeded()
    await choice.getByRole('button', { name: '选择…', exact: true }).click()
    await page.getByRole('textbox', { name: '搜索或添加选项' }).fill('极近特写')
    await page.getByRole('button', { name: /添加选项: 极近特写/ }).click()
    await page.keyboard.press('Escape')
    await expect(row).toContainText('极近特写')
    await page.getByRole('button', { name: '视图设置', exact: true }).click()
    await page.getByRole('button', { name: /大图/, exact: true }).click()
    await expect(page.locator('.storyboard-workspace')).toHaveClass(/density-large/)
    await page.getByRole('button', { name: '视图设置', exact: true }).click()
    await expect(page.locator('.floating-menu')).toBeVisible()
    expect(
      await page.locator('.section-header').evaluate((element) => element.scrollLeft + element.scrollTop)
    ).toBe(0)
    expect(
      await page
        .locator('.storyboard-workspace')
        .evaluate((element) => element.scrollLeft + element.scrollTop)
    ).toBe(0)
    await page.screenshot({ path: join(outputs, 'density-menu.png') })
    await page.getByRole('button', { name: /适中/, exact: true }).click()
    await page.locator('.story-table-scroll').evaluate((element) => {
      element.scrollLeft = 0
    })
    const separator = page.getByRole('separator', { name: /调整列宽: 画面/ })
    const before = await separator.boundingBox()
    await separator.focus()
    await page.keyboard.press('ArrowRight')
    expect((await separator.boundingBox())!.x).toBeGreaterThan(before!.x)
    await page.getByRole('button', { name: '＋ 新增镜头', exact: true }).click()
    await expect(page.locator('.story-table tbody tr')).toHaveCount(2)
    const firstId = await row.getAttribute('data-shot-id')
    await row.hover()
    await row.getByRole('button', { name: '拖动镜头' }).dragTo(page.locator('.story-table tbody tr').last())
    expect(await page.locator('.story-table tbody tr').last().getAttribute('data-shot-id')).toBe(firstId)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.toast.success').filter({ hasText: '项目保存成功' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('已保存')
    const exported = await page.evaluate(async () => {
      const s = window.__sbr.store.getState()
      const result = await window.sbr.loadProject(s.projectFolder)
      s.loadFromJson(s.projectFolder, result.json)
      return s.projectFolder
    })
    await page
      .locator('.workspace-nav')
      .getByRole('button', { name: /分镜本/ })
      .click()
    await page.getByRole('button', { name: '导出…', exact: true }).click()
    await page.getByRole('button', { name: '镜头表（CSV）', exact: true }).click()
    await expect(page.locator('.toast.success').filter({ hasText: '导出完成' })).toBeVisible()
    const csvFolder = readdirSync(join(exported, 'exports')).find((file) => file.startsWith('storyboard-'))!
    const csv = readFileSync(join(exported, 'exports', csvFolder, 'storyboard.csv'), 'utf8')
    expect(csv.match(/portrait.png/g)?.length).toBe(1)
    expect(csv.match(/landscape.png/g)?.length).toBe(2)
    await page.keyboard.press('Escape')
    for (const [width, height] of [
      [1100, 700],
      [1280, 800],
      [1440, 900],
      [1920, 1080]
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) => {
          BrowserWindow.getAllWindows()
            .find((window) => window.isVisible())!
            .setContentSize(width, height)
        },
        { width, height }
      )
      for (const workspace of ['storyboard', 'gallery', 'capture']) {
        await page.evaluate((workspace) => window.__sbr.store.getState().setWorkspace(workspace), workspace)
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
          .toBe(true)
        await page.screenshot({ path: join(outputs, `${workspace}-${width}.png`) })
      }
    }
    await page.locator('.language-select').selectOption('en')
    await page.evaluate(() => window.__sbr.store.getState().setWorkspace('storyboard'))
    await page.screenshot({ path: join(outputs, 'storyboard-en.png') })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
