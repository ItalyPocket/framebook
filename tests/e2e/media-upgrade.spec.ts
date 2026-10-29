import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

test('gallery video seeks, media filtering, duplicate protection and dock layout', async () => {
  const dir=mkdtempSync(join(tmpdir(),'framebook-media-'))
  mkdirSync(join(dir,'.app-data'))
  writeFileSync(join(dir,'.app-data','settings.json'),JSON.stringify({simplifyAnimations:true,introMode:'off'}))
  const video=join(dir,'clip.mp4')
  execFileSync(join(process.cwd(),'node_modules/ffmpeg-static/ffmpeg'),['-y','-f','lavfi','-i','color=c=blue:s=320x180:d=3','-c:v','libx264','-pix_fmt','yuv420p',video],{stdio:'ignore'})
  const app=await electron.launch({args:['out/main/index.js'],env:{...process.env,SBR_SMOKE_DIR:dir}})
  try {
    const page=await app.firstWindow()
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280,800))
    await page.locator('.language-select').selectOption('en')
    await page.evaluate(async (path) => {
      const folder=await window.sbr.createProject('Media upgrade')
      const state=window.__sbr.store.getState();state.newProject(folder,'Media upgrade')
      const imported=await window.sbr.importMedia(folder,path)
      const media=state.addMedia(imported)
      state.addFrame(media.id,.5,'FIRST');state.addFrame(media.id,2,'SECOND');state.addFrame(media.id,2.01,'NEAR')
      state.selectMedia(media.id);state.setWorkspace('gallery')
    },video)
    await page.locator('.gallery-image').first().click()
    const player=page.locator('.dock-gallery video')
    await expect.poll(() => player.evaluate((v:HTMLVideoElement) => v.currentTime)).toBeCloseTo(.5,1)
    await page.locator('.gallery-image').nth(1).click()
    await expect.poll(() => player.evaluate((v:HTMLVideoElement) => v.currentTime)).toBeCloseTo(2,1)
    await expect(page.locator('.dock-gallery .capture-marker')).toHaveCount(2)
    await page.locator('.dock-gallery .capture-marker').last().click()
    await expect(page.locator('.marker-popup')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'Arrange side by side',exact:true}).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('dock-side-gallery'))).toBe('yes')
    await page.evaluate(() => window.__sbr.store.getState().setWorkspace('capture'))
    await page.locator('.bin-item').first().click({button:'right'})
    await page.getByRole('button',{name:'Duplicate',exact:true}).click()
    expect(await page.evaluate(() => window.__sbr.store.getState().doc.media.length)).toBe(2)
    await page.locator('.bin-item').first().click({button:'right'})
    await page.getByRole('button',{name:'Remove from project',exact:true}).click()
    expect(await page.evaluate(() => window.__sbr.store.getState().doc.media.length)).toBe(2)
    await page.getByRole('button',{name:'Filter media',exact:true}).click()
    await page.locator('.media-filter-panel select').first().selectOption('image')
    await expect(page.locator('.bin-item:not(.scratch)')).toHaveCount(0)
    await page.getByRole('button',{name:'Clear filters',exact:true}).click()
    await expect(page.locator('.bin-item:not(.scratch)')).toHaveCount(2)
    await page.getByRole('button',{name:'List',exact:true}).click()
    await expect(page.getByRole('button',{name:'List',exact:true})).toHaveAttribute('aria-pressed','true')
    for(const size of [[1100,700],[1920,1080]]) {
      await app.evaluate(({BrowserWindow},[w,h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!,h!),size)
      expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    }
    await page.screenshot({path:'../outputs/media-upgrade-capture.png'})
    const separator=await page.locator('.dock-capture .dock-resizer.left').boundingBox()
    await page.mouse.move(separator!.x+2,separator!.y+30);await page.mouse.down();await page.mouse.move(separator!.x+52,separator!.y+30);await page.mouse.up()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dock-capture')!).left)).toBeGreaterThan(230)
    await page.locator('.dock-capture .dock-title').first().dragTo(page.locator('.dock-capture .dock-slot').nth(1))
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dock-capture')!).order[1])).toBe('media')
    await page.locator('.dock-capture').getByRole('button',{name:'Reset layout',exact:true}).click()

    await page.evaluate(() => window.__sbr.store.getState().setWorkspace('gallery'))
    await page.screenshot({path:'../outputs/media-upgrade-gallery.png'})
    await app.evaluate(() => {
      globalThis.fetch = async (input) => new Response(JSON.stringify(String(input).endsWith('/session') ? {data:{projectUuid:'test-project'}} : {data:{url:'https://libtv-res.liblib.art/claw/test-project/file.png'}}),{status:200,headers:{'Content-Type':'application/json'}})
    })
    const result = await page.evaluate(async () => {
      const configured=await window.sbr.libtvConfigure('isolated-test-key')
      const state=window.__sbr.store.getState()
      const media=state.doc.media[0]
      const folder=state.projectFolder
      const files=[{id:media.id,name:media.name,path:`${folder}/${media.sourceFile}`}]
      let rejected=false
      try { await window.sbr.libtvUpload(folder,'wrong-project',files) } catch {rejected=true}
      const id=await window.sbr.libtvUpload(folder,configured.projectId,files)
      return {id,rejected}
    })
    expect(result.rejected).toBe(true)
    await expect.poll(() => page.evaluate(async (id) => (await window.sbr.libtvStatus(id))?.state,result.id)).toBe('done')
    expect(await page.evaluate(async (id) => (await window.sbr.libtvStatus(id))?.items[0]?.state,result.id)).toBe('uploaded')

  } finally { await app.close() }
})
