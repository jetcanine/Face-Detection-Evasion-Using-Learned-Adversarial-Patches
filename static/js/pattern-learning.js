//  Jetcanine on github

// Personal pattern learning, independent of UI controls and Flask.
//    Input: captured pose canvases + landmarks. Output: 16×16 RGB Float32Array.
//    All learning remains in the browser. The detector's weights are frozen. 

(function(root){
'use strict';
async function learn({api,samples,method,size=224,steps=80,cancelled=()=>false,onProgress=async()=>{}}){
 if(!samples.length)throw Error('Map your face before learning a pattern.');
 const tf=api.tf,bases=[];let patch;
 try{
  for(const sample of samples){
   if(cancelled())return null;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
   canvas.getContext('2d').drawImage(sample.canvas,0,0,size,size);
   const raster=FaceMesh.raster(sample.points,method,size,FaceMeshData);
   if(!raster)throw Error('The mapped face surface is unavailable. Map your face again.');
   const rects=[FaceMesh.sampler(tf,raster)];
   try{bases.push({base:tf.tidy(()=>tf.browser.fromPixels(canvas).toFloat()),rects})}
   catch(e){rects.forEach(FaceLabCore.disposeSampler);throw e}
  }
  patch=tf.randomUniform([16,16,3],.3,.7);
  for(let i=0;i<steps;i++){
   if(cancelled())return null;
   const sample=bases[i%bases.length];
   const next=FaceLabCore.optimizeStep(api,sample.base,patch,sample.rects,size,i<steps/2?.04:.015);
   patch.dispose();patch=next;
   const values=i%4===0?new Float32Array(await patch.data()):null;
   if(cancelled())return null;
   await onProgress({step:i+1,total:steps,values});
   // Allow the browser to paint and handle Stop camera between batches.
   if(values)await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  return cancelled()?null:new Float32Array(await patch.data());
 }finally{
  patch?.dispose();
  for(const sample of bases){sample.base.dispose();sample.rects.forEach(FaceLabCore.disposeSampler)}
 }
}
root.PatternLearning={learn};
})(globalThis);
