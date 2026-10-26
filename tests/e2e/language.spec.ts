import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

test('language switches immediately and persists without changing project text', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: mkdtempSync(join(tmpdir(), 'framebook-language-')) } })
  try {
    const page = await app.firstWindow()
    await page.locator('.language-select').selectOption('zh-CN')
    await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible()
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label))
    expect(menu).toContain('编辑')
    await page.locator('.language-select').selectOption('en')
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
    const name = await page.evaluate(() => window.__sbr.store.getState().doc.name)
    expect(name).toBe('Smoke')
    await page.reload()
    await expect(page.locator('.language-select')).toHaveValue('en')
  } finally {
    await app.close()
  }
})
