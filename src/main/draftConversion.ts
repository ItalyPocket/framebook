import { pathToFileURL } from 'url'
import type { ConversionFormat, DraftClip, DraftTimeline } from '../shared/conversion'

type Data = Record<string, any>
const num = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const xml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]!))
const tag = (name: string, value: unknown): string => `<${name}>${xml(value)}</${name}>`
export function rate(fps: number): { numerator: number; denominator: number; timebase: number; ntsc: boolean } {
  const base = [24,30,48,60,120].find(value => Math.abs(fps-value*1000/1001)<0.002)
  return base ? {numerator:base*1000,denominator:1001,timebase:base,ntsc:true} : {numerator:Math.round(fps*1000),denominator:1000,timebase:Math.round(fps),ntsc:false}
}
const frames = (us: number, fps: number): number => { const r=rate(fps);return Math.round(us*r.numerator/r.denominator/1000000) }
const rateXml = (fps: number): string => `<rate>${tag('timebase',rate(fps).timebase)}${tag('ntsc',rate(fps).ntsc?'TRUE':'FALSE')}</rate>`
export function parseDraft(raw: Data, source: string, fallback: string): DraftTimeline {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tracks) || !raw.materials || typeof raw.materials !== 'object') throw new Error('Draft does not contain readable tracks and materials.')
  const fps=num(raw.fps,30)
  if(fps<=0 || fps>240) throw new Error('Unsupported timeline frame rate.')
  const timeline: DraftTimeline={name:typeof raw.name==='string' && raw.name || fallback,source,fps,width:num(raw.canvas_config?.width,1920),height:num(raw.canvas_config?.height,1080),duration:num(raw.duration),clips:[],issues:[],missing:[],raw}
  const materials=new Map<string,Data>()
  for(const list of Object.values(raw.materials)) if(Array.isArray(list)) for(const item of list) if(item && typeof item==='object' && typeof item.id==='string') materials.set(item.id,item)
  const issue=(feature:string,level:DraftTimeline['issues'][number]['level'],id:string):void => {
    const found=timeline.issues.find(item => item.feature===feature && item.level===level)
    if(found) { if(!found.clips.includes(id)) found.clips.push(id) } else timeline.issues.push({feature,level,clips:[id]})
  }
  raw.tracks.forEach((track:Data,index:number) => {
    for(const segment of Array.isArray(track.segments)?track.segments:[]) {
      const material=materials.get(segment.material_id) ?? {}
      const id=String(segment.id ?? `${index}-${timeline.clips.length}`)
      const target=segment.target_timerange
      if(!target || num(target.duration,-1)<0 || num(target.start,-1)<0) throw new Error(`Invalid target time range: ${id}`)
      const kind=String(track.type ?? material.type ?? 'unknown')
      let text=''
      if(kind==='text') { try { const content=typeof material.content==='string'?JSON.parse(material.content):material.content;text=String(content?.text ?? '') } catch { text=String(material.content ?? '') } }
      const sourceRange=segment.source_timerange
      const image=material.type==='photo' || material.type==='image'
      const start=sourceRange && typeof sourceRange.start==='number'?sourceRange.start:image?0:null
      const duration=sourceRange && typeof sourceRange.duration==='number'?sourceRange.duration:image?target.duration:null
      const clip=segment.clip ?? {}
      const item:DraftClip={id,track:index,kind,materialId:String(segment.material_id ?? ''),path:typeof material.path==='string'?material.path:'',name:String(material.material_name ?? material.name ?? id),start:num(target.start),duration:num(target.duration),sourceStart:start,sourceDuration:duration,width:num(material.width),height:num(material.height),fps:num(material.fps,fps),materialDuration:num(material.duration),text,hasAudio:kind==='video' && !image && material.has_audio !== false && material.has_audio !== 0,volume:segment.is_mute?0:num(segment.volume,1),speed:num(segment.speed,1),rotation:num(clip.rotation),x:num(clip.transform?.x),y:num(clip.transform?.y),scaleX:num(clip.scale?.x,1)*(clip.flip?.horizontal?-1:1),scaleY:num(clip.scale?.y,1)*(clip.flip?.vertical?-1:1),opacity:num(clip.alpha,1)}
      if(item.hasAudio) issue('Embedded video audio','unverified',id)
      timeline.clips.push(item);timeline.duration=Math.max(timeline.duration,item.start+item.duration)
      if((kind==='video' || kind==='audio') && start===null) issue('Missing source range','unsupported',id)
      if(!['video','audio','text'].includes(kind)) issue('Other tracks','unsupported',id)
      if(kind==='text') issue('Text appearance','approximate',id)
      if(segment.common_keyframes?.length || segment.keyframe_refs?.length) issue('Keyframe animation','unsupported',id)
      for(const ref of segment.extra_material_refs ?? []) {
        const effect=materials.get(ref)
        if(!effect) continue
        const group=Object.entries(raw.materials).find(([,list]) => Array.isArray(list) && list.includes(effect))?.[0] ?? 'Effects'
        if(group==='speeds') { if(effect.curve_speed || effect.speed_points?.length) issue('Variable speed','approximate',id);if(typeof effect.speed==='number') item.speed=effect.speed }
        else issue(group==='transitions'?'Transitions':group==='audio_fades'?'Audio fades':group==='material_animations'?'Keyframe animation':'Effects and color','unsupported',id)
      }
      if(item.scaleX<0 || item.scaleY<0) issue('Flip','unsupported',id)
      if(item.speed<0 || segment.reverse) issue('Reverse playback','unsupported',id)
      if(item.scaleX!==1 || item.scaleY!==1 || item.rotation || item.x || item.y || item.opacity!==1) issue('Transform','unverified',id)
    }
  })
  return timeline
}
function filter(name:string,parameters:string):string { return `<filter>${tag('enabled','TRUE')}<effect>${tag('name',name)}${tag('effectid',name)}${tag('effectcategory','motion')}${tag('effecttype','motion')}<mediatype>video</mediatype>${parameters}</effect></filter>` }
const parameter=(id:string,value:unknown):string => `<parameter>${tag('parameterid',id)}${typeof value==='string' && value.startsWith('<')?`<value>${value}</value>`:tag('value',value)}</parameter>`
export function timelineXml(t:DraftTimeline):string {
  if(t.clips.some(c => ['video','audio'].includes(c.kind) && (!c.path || c.sourceStart === null || c.sourceDuration === null))) throw new Error('Missing source path or source range. XML export would lose clips.')
  const mediaFile=(c:DraftClip,id:string,kind:string):string => `<file id="${id}">${tag('name',c.name)}${tag('pathurl',pathToFileURL(c.path).href)}${rateXml(c.fps)}${tag('duration',frames(Math.max(c.materialDuration,(c.sourceStart??0)+(c.sourceDuration??c.duration)),c.fps))}<media>${kind==='video'?`<video><samplecharacteristics>${rateXml(c.fps)}${tag('width',c.width||t.width)}${tag('height',c.height||t.height)}</samplecharacteristics></video>`:'<audio><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics><channelcount>2</channelcount></audio>'}</media></file>`
  const clips = [...t.clips, ...t.clips.filter(c => c.hasAudio).map(c => ({ ...c, id: `${c.id}-audio`, kind: 'audio', track: 1000 + c.track }))]
  const track=(kind:string):string => [...new Set(clips.filter(c=>c.kind===kind).map(c=>c.track))].map(index=>`<track>${clips.filter(c=>c.kind===kind&&c.track===index&&c.path&&c.sourceStart!==null).map((c,i)=>{
    const start=frames(c.start,t.fps),end=frames(c.start+c.duration,t.fps),input=frames(c.sourceStart!,c.fps),out=frames(c.sourceStart!+(c.sourceDuration??c.duration),c.fps)
    const transform=kind==='video'?filter('basic',parameter('scale',Math.abs(c.scaleX)*100)+parameter('rotation',c.rotation)+parameter('center',`<horiz>${c.x}</horiz><vert>${c.y}</vert>`)+parameter('aspect',c.scaleX?Math.abs(c.scaleY/c.scaleX)-1:0))+filter('opacity',parameter('opacity',c.opacity*100)): `<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effecttype>audiolevels</effecttype><mediatype>audio</mediatype>${parameter('level',c.volume)}</effect></filter>`
    const speed=Math.abs((c.sourceDuration??c.duration)-c.duration)>1?`<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><effecttype>motion</effecttype><mediatype>video</mediatype>${parameter('speed',(c.sourceDuration??c.duration)/Math.max(1,c.duration)*100)}</effect></filter>`:''
    return `<clipitem id="clip-${kind}-${index}-${i}">${tag('name',c.name)}${tag('enabled','TRUE')}${rateXml(c.fps)}${tag('start',start)}${tag('end',end)}${tag('in',input)}${tag('out',out)}${mediaFile(c,`file-${kind}-${index}-${i}`,kind)}<sourcetrack>${tag('mediatype',kind)}<trackindex>1</trackindex></sourcetrack>${transform}${speed}</clipitem>`
  }).join('')}<enabled>TRUE</enabled><locked>FALSE</locked></track>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="framebook-sequence">${tag('name',t.name)}${tag('duration',frames(t.duration,t.fps))}${rateXml(t.fps)}<media><video><format><samplecharacteristics>${rateXml(t.fps)}${tag('width',t.width)}${tag('height',t.height)}<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>${track('video')}</video><audio>${track('audio')}</audio></media></sequence></xmeml>`
}
const stamp=(us:number,ass=false):string => {const ms=Math.round(us/1000);const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${ass?h:String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${ass?'.':','}${String(ass?Math.floor(ms%1000/10):ms%1000).padStart(ass?2:3,'0')}`}
export function convertTimeline(t:DraftTimeline,format:ConversionFormat):string|Buffer {
  const texts=t.clips.filter(c=>c.kind==='text'&&c.text).sort((a,b)=>a.start-b.start)
  if(format==='xml') return timelineXml(t)
  if(format==='json') return JSON.stringify(t,null,2)
  if(format==='txt') return texts.map(c=>c.text).join('\n\n')
  if(format==='srt') return texts.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.start+c.duration)}\n${c.text}\n`).join('\n')
  if(format==='ass') return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${t.width}\nPlayResY: ${t.height}\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,PingFang SC,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,30,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${texts.map(c=>`Dialogue: ${c.track},${stamp(c.start,true)},${stamp(c.start+c.duration,true)},Default,,0,0,0,,${c.text.replace(/\\/g,'\\\\').replace(/[{}]/g,'').replace(/\r?\n/g,'\\N')}`).join('\n')}`
  if(texts.some(c=>/[^\x20-\x7e\r\n]/.test(c.text))) throw new Error('EBU STL export currently supports ASCII subtitles only. Use SRT or ASS for Chinese.')
  const stlFps=rate(t.fps).timebase
  if(![25,30].includes(stlFps)) throw new Error('EBU STL requires a 25 or 30 fps timeline.')
  const gsi=Buffer.alloc(1024,0x20);gsi.write('850',0);gsi.write(stlFps===25?'STL25.01':'STL30.01',3);gsi.write('10000',11);gsi.write('00',14);gsi.write(String(texts.length).padStart(5,'0'),238);gsi.write(String(texts.length).padStart(5,'0'),243);gsi.write('001',248);gsi.write('40',251);gsi.write('23',253);gsi.write('10000000000000000',255)
  const blocks=texts.map((c,i)=>{const text=Buffer.from(c.text.replace(/\r?\n/g,'\x8a'),'ascii');if(text.length>111)throw new Error('EBU STL subtitle exceeds 111 bytes. Use SRT or ASS.');const block=Buffer.alloc(128,0x8f);block[0]=0;block.writeUInt16LE(i+1,1);block[3]=0xff;block[4]=0;for(const [offset,us] of [[5,c.start],[9,c.start+c.duration]]) {const n=frames(us,t.fps);block[offset]=Math.floor(n/stlFps/3600);block[offset+1]=Math.floor(n/stlFps/60)%60;block[offset+2]=Math.floor(n/stlFps)%60;block[offset+3]=n%stlFps}block[13]=20;block[14]=2;block[15]=0;text.copy(block,16);return block})
  return Buffer.concat([gsi,...blocks])
}
