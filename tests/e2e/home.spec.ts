import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

test('home saves changes, replays intro and resumes or reopens the project', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framebook-home-'))
  mkdirSync(join(dir, '.app-data'))
  writeFileSync(join(dir, '.app-data', 'settings.json'), JSON.stringify({ simplifyAnimations: true, introMode: 'off' }))
  const app = await electron.launch({
    args: process.env.SBR_TEST_APP ? [] : ['out/main/index.js'],
    executablePath: process.env.SBR_TEST_APP,
    env: { ...process.env, SBR_SMOKE_DIR: dir }
  })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800))
    await page.locator('.language-select').selectOption('en')
    expect(await page.evaluate(async () => {
      const settings = await window.sbr.getSettings()
      return [settings.effectScheme, settings.introDuration]
    })).toEqual(['workspace', 'full'])
    await expect(page.locator('.launch-intro')).toHaveCount(0)
    const folder = await page.evaluate(async () => {
      const folder = await window.sbr.createProject('Home test')
      const state = window.__sbr.store.getState()
      state.newProject(folder, 'Home test')
      state.mutate('Edit synopsis', (doc: any) => { doc.storyboard.synopsis = 'Preserved on return home' })
      return folder
    })
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.locator('.welcome')).toBeVisible()
    await expect(page.locator('.launch-intro')).toBeVisible()
    await expect(page.locator('.launch-intro')).toHaveCount(0)
    expect(JSON.parse(readFileSync(join(folder, 'project.json'), 'utf8')).storyboard.synopsis).toBe('Preserved on return home')
    await page.getByRole('button', { name: 'Continue project', exact: true }).click()
    await expect(page.locator('.workspace-nav')).toBeVisible()
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.locator('.launch-intro')).toHaveCount(0)
    await page.getByRole('button', { name: 'Open Project…', exact: true }).click()
    await page.locator('.project-card').first().click()
    await expect(page.locator('.workspace-nav')).toBeVisible()
  } finally {
    await app.close()
  }
})
