'use strict';
(function(){
// Resolve all resources relative to Flask's static directory, including subpath deployments.
const staticBase=new URL('../',document.currentScript.src);
const asset=path=>new URL(path,staticBase).href;
const $=id=>document.getElementById(id),SIZE=384,NET_SIZE=224;
const video=$('video'),original=$('original'),filtered=$('filtered');
const raw=document.createElement('canvas'),altered=document.createElement('canvas'),texture=document.createElement('canvas');
raw.width=raw.height=altered.width=altered.height=SIZE;texture.width=texture.height=16;
const rc=raw.getContext('2d',{willReadFrequently:true}),ac=altered.getContext('2d',{willReadFrequently:true});
const live=document.createElement('canvas');live.width=live.height=SIZE;const liveCtx=live.getContext('2d'),originalCtx=original.getContext('2d'),filteredCtx=filtered.getContext('2d');
const state={running:false,starting:false,training:false,cancel:false,ready:false,stream:null,method:'none',threshold:.5,samples:[],lastSample:0,patch:null,frames:0,misses:0,generation:0,raf:null,lastRawBox:null,patches:{},surface:"plain",fitting:false,fitPhase:0,fitCount:0,fitSamples:[],fitted:false,mesh:null,meshAt:0,meshFrameAt:0,meshBusy:false,analysisWantsMesh:false,meshError:null,overlayKey:null,analysisTimer:null,analysisBusy:false,analysisTask:null,result:null,previewFrames:0,previewSince:0,previewVideoTime:-1,analysisTimes:[]};
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error)}
function reset(){state.frames=state.misses=0;$('missRate').textContent='—';$('sampleCount').textContent='0';$('fps').textContent='—';$('previewFps').textContent='—';state.result=null;state.analysisTimes=[];state.previewFrames=0;state.previewSince=performance.now();state.previewVideoTime=-1;$('checkAge').textContent='Waiting for a check.';if(state.running){$('rawStatus').textContent=$('filteredStatus').textContent='Checking…';$('rawStatus').className=$('filteredStatus').className='status'}}
const names={none:'No filter',cheeks:'Cheek paint',mask:'Lower-face mask',forehead:'Forehead patch'};
function controls(){document.querySelectorAll('.method').forEach(b=>b.disabled=state.training||state.fitting);$('calibrate').disabled=!state.running||state.training||state.fitting||!state.fitted;$('fit').disabled=!state.running||state.training;$('fit').textContent=state.fitting?'Cancel mapping':'Map the filter';$('surface').disabled=state.training||state.fitting;const surface=$('surface');let learned=Array.from(surface.options).find(option=>option.value==='learned');if(!learned){learned=document.createElement('option');learned.value='learned';learned.textContent='Learned pattern';surface.add(learned)}learned.disabled=!state.patches[state.method];$('camera').textContent=state.starting?'Starting…':state.running?'Stop camera':'Start camera';$('camera').disabled=state.starting||(state.training&&!state.running);}
function label(){ $('methodLabel').textContent=state.method==='none'?'NO FILTER':names[state.method].toUpperCase()+' / '+(state.surface==='learned'?'LEARNED':'PLAIN CONTROL') }
function setMethod(method){if(!Object.hasOwn(names,method))throw Error('Unknown filter');if(state.training||state.fitting)throw Error('Finish fitting or calibration first');state.method=method;state.patch=state.patches[method]||null;state.surface=state.patch?'learned':'plain';$('surface').value=state.surface;state.generation++;state.overlayKey=null;reset();document.querySelectorAll('.method').forEach(b=>{const active=b.dataset.method===method;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});$('patchControls').hidden=method==='none';label();controls();}
let tracker;
async function initMesh(){
 if(!tracker)tracker=new FaceTracker(asset('js/face-tracker-worker.js'));
 await tracker.init();
}
async function meshFrame(canvas){
 state.meshBusy=true;const activeTracker=tracker;
 try{const bitmap=await createImageBitmap(canvas);if(!state.running||activeTracker!==tracker){bitmap.close();return null}return await activeTracker.detect(bitmap)}
 finally{state.meshBusy=false}
}
async function analysisMesh(){
 state.analysisWantsMesh=true;
 try{while(state.meshBusy){await new Promise(r=>setTimeout(r,8));if(!state.running)return null}if(!state.running)return null;return await meshFrame(raw)}finally{state.analysisWantsMesh=false}
}
function previewMesh(now){
 if(state.meshBusy||state.analysisWantsMesh||now-state.meshFrameAt<100||state.meshError)return;
 state.meshFrameAt=now;const generation=state.generation;
 meshFrame(live).then(points=>{if(state.running&&!state.training&&generation===state.generation){state.mesh=points;state.meshAt=now;state.overlayKey=null}}).catch(e=>{if(state.running&&generation===state.generation){state.meshError=e.message;notice(e.message,true)}});
}
let dependencyPromise;
function loadScript(path,check){
 if(check())return Promise.resolve();
 return new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>reject(Error('A camera component took too long to download. Reload and try again.')),45000);script.src=asset(path);script.onload=()=>{clearTimeout(timer);check()?resolve():reject(Error('A camera component could not initialize. Reload this page.'))};script.onerror=()=>{clearTimeout(timer);reject(Error('A camera component could not download. Check your connection and reload.'))};document.head.append(script)});
}
async function models(){
 if(!dependencyPromise)dependencyPromise=Promise.all([
  loadScript('vendor/face-api.min.js',()=>!!window.faceapi),
  loadScript('js/pattern-optimizer.js',()=>!!window.FaceLabCore),
  loadScript('js/mesh-data.js',()=>!!window.FaceMeshData),
  loadScript('js/mesh-renderer.js',()=>!!window.FaceMesh),
  loadScript('js/face-tracker.js',()=>!!window.FaceTracker),
  loadScript('js/pattern-learning.js',()=>!!window.PatternLearning)
 ]).catch(e=>{dependencyPromise=null;throw e});
 await dependencyPromise;
 if(state.ready){await initMesh();return}
 await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(asset('models')),initMesh()]);state.ready=true;
}

async function detect(canvas,threshold=state.threshold){
 const detections=await faceapi.detectAllFaces(canvas,new faceapi.TinyFaceDetectorOptions({inputSize:NET_SIZE,scoreThreshold:threshold}));
 return detections.map(d=>({box:d.box,score:d.score}));
}
function clearViews(){for(const canvas of[original,filtered])canvas.getContext('2d').clearRect(0,0,SIZE,SIZE);$('emptyRaw').hidden=$('emptyFiltered').hidden=false;$('rawStatus').textContent=$('filteredStatus').textContent='Camera off';$('rawStatus').className=$('filteredStatus').className='status'}
function stop(){tracker?.close();tracker=null;state.cancel=true;state.running=false;state.generation++;if(state.raf)cancelAnimationFrame(state.raf);clearTimeout(state.analysisTimer);state.analysisTimer=null;state.result=null;liveCtx.clearRect(0,0,SIZE,SIZE);state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;video.srcObject=null;state.samples=[];state.fitSamples=[];state.fitted=false;state.fitting=false;state.patch=null;state.patches={};state.surface="plain";$("surface").value="plain";$("fitProgress").value=0;state.mesh=null;overlayCtx.clearRect(0,0,overlay.width,overlay.height);state.overlayKey=null;state.lastRawBox=null;$("fitStatus").textContent="";$("fitStatus").hidden=true;$("fitProgress").hidden=true;label();rc.clearRect(0,0,SIZE,SIZE);ac.clearRect(0,0,SIZE,SIZE);texture.getContext('2d').clearRect(0,0,16,16);clearViews();reset();controls();notice('Camera stopped. Frames cleared from memory. Your camera stays on your device.')}
async function start(){
 if(state.running){stop();return}if(state.starting)return;state.starting=true;controls();notice('Requesting camera access… If you allowed it before, your browser may not ask again.');
 let stream;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('This browser cannot access the camera here. Open the site directly in Chrome using its HTTPS address.');
  const permissionTimer=setTimeout(()=>{if(state.starting&&!state.stream)notice('Waiting for camera permission. Check your browser’s camera setting, or open this site directly in Chrome.')},12000);
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})}finally{clearTimeout(permissionTimer)}state.stream=stream;video.srcObject=stream;await video.play();
  notice('Camera allowed. Loading face-tracking tools for the first start…');
  let warmup;const showCamera=()=>{if(!state.starting)return;if(capture(liveCtx)){originalCtx.drawImage(live,0,0);filteredCtx.drawImage(live,0,0);$('emptyRaw').hidden=$('emptyFiltered').hidden=true;$('rawStatus').textContent=$('filteredStatus').textContent='Loading tracker…'}warmup=requestAnimationFrame(showCamera)};showCamera();
  try{await models()}finally{cancelAnimationFrame(warmup)}state.running=true;state.cancel=false;state.samples=[];state.lastSample=0;state.patch=null;state.meshError=null;state.generation++;reset();setMethod(state.method);$('emptyRaw').hidden=$('emptyFiltered').hidden=true;notice('Choose “Map the filter” to get started.');startLoops();
 }catch(e){stream?.getTracks().forEach(t=>t.stop());state.stream=null;video.srcObject=null;state.running=false;let message=e.name==='NotAllowedError'?'Camera access was blocked. Open this site in Chrome, tap the site controls beside the address, allow Camera, and reload.':e.name==='NotFoundError'?'No camera was found on this device.':e.name==='NotReadableError'?'The camera is in use by another app. Close it there and try again.':e.message;notice(message,true);clearViews()}
 finally{state.starting=false;controls()}
}
function capture(ctx=rc){const w=video.videoWidth,h=video.videoHeight;if(!w||!h)return false;const side=Math.min(w,h);ctx.drawImage(video,(w-side)/2,(h-side)/2,side,side,0,0,SIZE,SIZE);return true}
function patchCanvas(values){const pixels=new ImageData(16,16);for(let i=0;i<256;i++){for(let c=0;c<3;c++)pixels.data[i*4+c]=Math.round(values[i*3+c]*255);pixels.data[i*4+3]=255}texture.getContext('2d').putImageData(pixels,0,0)}
const overlay=document.createElement('canvas'),overlayCtx=overlay.getContext('2d');
function drawSurface(ctx,points,method,patch){
 const r=FaceMesh.raster(points,method,SIZE,FaceMeshData);if(!r)return;
 overlay.width=r.width;overlay.height=r.height;overlayCtx.putImageData(new ImageData(FaceMesh.pixels(r,patch),r.width,r.height),0,0);ctx.drawImage(overlay,r.x,r.y);
}
function applyFilter(ctx,points,method=state.method){if(!points||method==='none')return;drawSurface(ctx,points,method,state.surface==='learned'?state.patches[method]:null)}
function wireframe(ctx,points){if(!points)return;ctx.save();ctx.lineWidth=.5;ctx.strokeStyle='#8ce9c166';ctx.beginPath();for(const t of FaceMeshData.triangles){ctx.moveTo(points[t[0]].x,points[t[0]].y);ctx.lineTo(points[t[1]].x,points[t[1]].y);ctx.lineTo(points[t[2]].x,points[t[2]].y);ctx.closePath()}ctx.stroke();ctx.restore()}
function fitMessage(){return ['Look straight ahead and hold briefly.','Turn gently toward either side and hold.','Turn gently toward the opposite side and hold.'][state.fitPhase]}
function beginFit(){
 if(!state.running||state.training)return;
 if(state.fitting){state.fitting=false;state.fitSamples=[];$('fitStatus').hidden=true;$('fitProgress').hidden=true;controls();return}
 state.fitting=true;state.fitPhase=0;state.fitCount=0;state.fitSamples=[];state.fitDirection=0;state.generation++;reset();$('fitStatus').textContent='Move your face left and right to calibrate the filter mesh.';$('fitStatus').hidden=false;$('fitProgress').hidden=false;$('fitProgress').value=0;controls();
}
function collectFit(points){
 if(!state.fitting)return;
 const yaw=FaceMesh.pose(points);if(yaw===null)return;
 const ok=state.fitPhase===0?Math.abs(yaw)<.08:state.fitPhase===1?Math.abs(yaw)>.1&&Math.abs(yaw)<.3:yaw*state.fitDirection<-.1&&Math.abs(yaw)<.3;
 if(!ok){state.fitCount=0;$('fitStatus').textContent='Move your face left and right to calibrate the filter mesh.';$('fitStatus').hidden=false;$('fitProgress').hidden=false;return}
 state.fitCount++;if(state.fitCount<2)return;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;canvas.getContext('2d').drawImage(raw,0,0);state.fitSamples.push({canvas,points:points.map(p=>({...p}))});
 if(state.fitPhase===1)state.fitDirection=Math.sign(yaw);
 state.fitPhase++;state.fitCount=0;$('fitProgress').value=state.fitPhase;
 if(state.fitPhase===3){state.samples=state.fitSamples;state.fitSamples=[];state.fitting=false;state.fitted=true;state.patches={};state.patch=null;state.surface='plain';$('surface').value='plain';state.generation++;reset();label();$('fitStatus').textContent='Filter mapped.';controls();}
 else {$('fitStatus').textContent='Move your face left and right to calibrate the filter mesh.';$('fitStatus').hidden=false;$('fitProgress').hidden=false;}
}
function draw(canvas,source,detections){const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);ctx.lineWidth=2;ctx.strokeStyle='#8ce9c1';for(const d of detections){const b=d.box;ctx.strokeRect(b.x,b.y,b.width,b.height)}}
function status(id,detections,matched=true){const el=$(id);const detected=detections.length>0&&matched;el.textContent=detected?'Face detected':detections.length>0?'Other detection':'Face not detected';el.className='status '+(detected?'detected':'missed')}
function drawBoxes(ctx,detections){ctx.lineWidth=2;ctx.strokeStyle='#8ce9c1';for(const d of detections){const b=d.box;ctx.strokeRect(b.x,b.y,b.width,b.height)}}
function renderPreview(now){
 if(!state.running||state.training)return;
 if(video.currentTime!==state.previewVideoTime&&capture(liveCtx)){
  state.previewVideoTime=video.currentTime;
  const result=state.result,fresh=result&&result.generation===state.generation&&now-result.frameAt<800;
  originalCtx.drawImage(live,0,0);filteredCtx.drawImage(live,0,0);
  previewMesh(now);
  const meshFresh=state.mesh&&now-state.meshAt<500;
  if(meshFresh){
   if(state.method!=='none'){
    const key=state.meshAt+':'+state.method+':'+state.surface;
    if(state.overlayKey!==key){const r=FaceMesh.raster(state.mesh,state.method,SIZE,FaceMeshData);overlay.width=r.width;overlay.height=r.height;overlayCtx.putImageData(new ImageData(FaceMesh.pixels(r,state.surface==='learned'?state.patches[state.method]:null),r.width,r.height),0,0);state.overlayPosition=r;state.overlayKey=key}
    filteredCtx.drawImage(overlay,state.overlayPosition.x,state.overlayPosition.y);
   }
   if(state.fitting||$('showMesh').checked)wireframe(filteredCtx,state.mesh);
  }
  if(fresh&&!state.fitting){drawBoxes(originalCtx,result.baseline);drawBoxes(filteredCtx,result.after)}
  state.previewFrames++;
  const elapsed=now-state.previewSince;
  if(elapsed>=1000){$('previewFps').textContent=(1000*state.previewFrames/elapsed).toFixed(1);state.previewFrames=0;state.previewSince=now}
  if(result){$('checkAge').textContent=`Latest analyzed frame: ${Math.round(now-result.frameAt)} ms ago.`;if(!fresh){$('rawStatus').textContent=$('filteredStatus').textContent='Checking…';$('rawStatus').className=$('filteredStatus').className='status'}}
 }
 state.raf=requestAnimationFrame(renderPreview);
}
function scheduleAnalysis(delay=0){
 if(!state.running||state.training||state.analysisTimer!==null||state.analysisBusy)return;
 state.analysisTimer=setTimeout(()=>{
  state.analysisTimer=null;if(!state.running||state.training)return;
  state.analysisBusy=true;const started=performance.now();
  state.analysisTask=analyze().finally(()=>{state.analysisBusy=false;state.analysisTask=null;scheduleAnalysis(Math.max(0,125-(performance.now()-started)))});
 },delay);
}
function startLoops(){if(!state.running||state.training)return;if(state.raf)cancelAnimationFrame(state.raf);state.raf=requestAnimationFrame(renderPreview);scheduleAnalysis()}
async function analyze(){
 const generation=state.generation,frameAt=performance.now(),threshold=state.threshold,method=state.method;
 const valid=()=>state.running&&!state.training&&generation===state.generation;
 try{
  if(!capture())return;
  const [baseline,points]=await Promise.all([detect(raw,threshold),analysisMesh()]);
  if(!valid())return;
  if(points){if(frameAt>=state.meshAt){state.mesh=points;state.meshAt=frameAt;state.overlayKey=null}collectFit(points)}
  if(state.fitting){notice(points?fitMessage():'Face mesh not found. Look toward the camera in good light.');return}
  if(!valid())return;
  const largest=baseline.slice().sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height)[0],box=largest?.box;
  ac.drawImage(raw,0,0);applyFilter(ac,points,method);state.overlayKey=null;
  // Keep both independent detector runs even when no filter is applied.
  const after=await detect(altered,threshold);if(!valid())return;
  const matches=largest?after.some(d=>FaceLabCore.iou(d.box,largest.box)>=.3):after.length>0;
  state.result={generation,frameAt,box,points,baseline,after};
  status('rawStatus',baseline);status('filteredStatus',after,matches);if(method!=='none'&&!points){$('filteredStatus').textContent='Tracker lost';$('filteredStatus').className='status'}
  if(largest&&(method==='none'||points)){state.frames++;if(!matches)state.misses++;$('missRate').textContent=(100*state.misses/state.frames).toFixed(1)+'%';$('sampleCount').textContent=state.frames.toLocaleString()}
  const completed=performance.now();state.analysisTimes.push(completed);state.analysisTimes=state.analysisTimes.filter(t=>completed-t<3000);
  if(state.analysisTimes.length>1)$('fps').textContent=((state.analysisTimes.length-1)*1000/(completed-state.analysisTimes[0])).toFixed(1);
  if(state.meshError)notice(state.meshError,true);
  else if(method!=='none'&&!points)notice('The placement tracker cannot find your face. Look forward or improve the lighting.');
  else if(!largest)notice('The original detector cannot find your face. This frame is excluded from the miss rate.');
  else notice(state.fitted?'Live test on new frames. Compare the learned pattern with the same shape in plain gray.':'Choose “Map the filter” to get started.');
 }catch(e){if(valid()){stop();notice('Detection stopped: '+e.message+'. Restart the camera to try again.',true)}}
}
async function calibrate(){
 if(!state.running||state.training||state.fitting||state.method==='none')return;
 if(!state.fitted||state.samples.length<3){notice('Map the filter before learning a pattern.',true);return}
 state.training=true;state.cancel=false;state.generation++;if(state.raf)cancelAnimationFrame(state.raf);clearTimeout(state.analysisTimer);state.analysisTimer=null;controls();$('training').hidden=false;$('progress').value=0;$('methodLabel').textContent='CALIBRATION / SNAPSHOT';notice('Learning from recent frames. The displayed frame is frozen during calibration; move naturally again when it finishes.');
 let learned;
 try{
  // Analysis and training never run concurrently; each keeps its own fixed snapshot.
  if(state.analysisTask)await state.analysisTask;
  if(state.cancel||!state.running)return;
  const samples=state.samples.slice(),latest=samples[samples.length-1];
  learned=await PatternLearning.learn({api:faceapi,samples,method:state.method,size:NET_SIZE,
   cancelled:()=>state.cancel||!state.running,
   onProgress:async({step,total,values})=>{
    $('progress').value=step;$('trainingText').textContent=`Learning texture · ${step} / ${total} steps`;
    if(values){patchCanvas(values);ac.drawImage(latest.canvas,0,0);drawSurface(ac,latest.points,state.method,values);draw(original,latest.canvas,[]);draw(filtered,altered,[]);$('rawStatus').textContent=$('filteredStatus').textContent='Calibration snapshot';$('rawStatus').className=$('filteredStatus').className='status'}
   }
  });
  if(learned&&!state.cancel&&state.running){state.patch=learned;state.patches[state.method]=state.patch;state.surface="learned";$("surface").value="learned";state.overlayKey=null;patchCanvas(state.patch);$('patchNote').textContent='If Original shows a bounding box but Filtered shows “Face not detected”, the filter fooled the detector on that frame.';notice('Calibration complete. Testing on new live frames now.');reset();label()}
 }catch(e){notice('Calibration could not finish: '+e.message+'. The detector results remain unchanged.',true);state.patch=null;$('patchNote').textContent='Calibration failed. Try again, or use the plain covering control.'}
 finally{state.training=false;$('training').hidden=true;label();controls();if(state.running)startLoops()}
}
$('fit').onclick=beginFit;$('surface').onchange=e=>{state.surface=e.target.value;state.generation++;state.overlayKey=null;reset();label()};$('camera').onclick=start;$('calibrate').onclick=calibrate;$('reset').onclick=reset;
document.querySelectorAll('.method').forEach(b=>b.onclick=()=>setMethod(b.dataset.method));
window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running)stop()});controls();
if(document.modelContext?.registerTool){
 const life=new AbortController();const tool={name:'set_face_filter',title:'Select face filter',description:'Select an existing filter in the camera experiment. Does not enable the camera or start calibration.',inputSchema:{type:'object',properties:{method:{type:'string',enum:['none','cheeks','mask','forehead']}},required:['method'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length!==1||!['none','cheeks','mask','forehead'].includes(input.method))throw Error('Provide one supported method');setMethod(input.method);return{method:state.method,calibrated:!!state.patch,cameraActive:state.running}}};
 try{Promise.resolve(document.modelContext.registerTool(tool,{signal:life.signal})).catch(()=>{})}catch(_){}window.addEventListener('pagehide',()=>life.abort(),{once:true});
}

window.FaceLabReady=true;
})();
