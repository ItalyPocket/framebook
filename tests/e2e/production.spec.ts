import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

test('production schedule, call sheet, takes and persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framebook-production-'))
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, SBR_SMOKE_DIR: dir }
  })
  try {
    const page = await app.firstWindow()
    await page.locator('.language-select').selectOption('zh-CN')
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Production')
    await page.getByRole('dialog').getByRole('button', { name: '新建项目', exact: true }).click()
    await page.locator('.workspace-nav button').filter({ hasText: '拍摄计划' }).click()
    await page.getByRole('button', { name: '新增拍摄日', exact: true }).click()
    await page.getByRole('button', { name: '添加休息／转场', exact: true }).click()
    await expect(page.locator('.production-item')).toHaveCount(1)
    await page.getByLabel('预计拍摄（分钟）', { exact: true }).fill('30')
    await page.getByRole('button', { name: '拍摄通告', exact: true }).click()
    await page.getByLabel('集合地点与时间', { exact: true }).fill('09:00 Studio')
    await page.locator('.workspace-nav button').filter({ hasText: '现场拍摄' }).click()
    await page.getByRole('button', { name: '记录下一条', exact: true }).click()
    await expect(page.locator('.take-row')).toContainText('TAKE 1')
    await page.getByLabel('素材文件名', { exact: true }).fill('A001.mov')
    const saved = await page.evaluate(async () => {
      const state = window.__sbr.store.getState()
      const json = JSON.stringify(state.doc)
      await window.sbr.saveProject(state.projectFolder, json)
      return JSON.parse((await window.sbr.loadProject(state.projectFolder)).json)
    })
    expect(saved.version).toBe(6)
    expect(saved.production.days[0].items[0].minutes).toBe(30)
    expect(saved.production.days[0].notice.meeting).toBe('09:00 Studio')
    expect(saved.production.takes[0].filename).toBe('A001.mov')
    await page.getByRole('button', { name: '电子场记板', exact: true }).click()
    await expect(page.locator('.slate')).toContainText('TAKE 2')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '预览 PDF', exact: true }).click()
    await expect(page.locator('.pdf-page-canvas')).toHaveAttribute('data-ready', 'true')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: '../outputs/production-2.4.png', animations: 'disabled' })
  } finally {
    await app.close()
  }
})
