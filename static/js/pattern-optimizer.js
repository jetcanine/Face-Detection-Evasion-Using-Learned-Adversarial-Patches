/* Differentiable personal patch experiment; not a reproduction of a published attack. */
(function(root){
'use strict';
function disposeSampler(s){s.indices.forEach(t=>t.dispose());s.weights.forEach(t=>t.dispose());s.mask.dispose()}
function iou(a,b){const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return w*h/(a.width*a.height+b.width*b.height-w*h||1)}
function composite(tf,base,patch,samplers,size){
 let result=base;const flat=patch.reshape([256,3]);
 for(const sampler of samplers){
  let sampled=tf.gather(flat,sampler.indices[0]).mul(sampler.weights[0]);
  for(let i=1;i<4;i++)sampled=sampled.add(tf.gather(flat,sampler.indices[i]).mul(sampler.weights[i]));
  const mask=tf.pad(sampler.mask,sampler.padding),pixels=tf.pad(sampled.reshape([sampler.height,sampler.width,3]),sampler.padding);
  result=result.mul(tf.scalar(1).sub(mask)).add(pixels.mul(255));
 }
 return result;
}
function objective(api,base,patch,rects,size){
 const tf=api.tf,net=api.nets.tinyFaceDetector;
 return tf.tidy(()=>{
  const rgb=composite(tf,base,patch,rects,size);
  const mean=tf.tensor1d(net.config.meanRgb);
  const input=rgb.sub(mean).div(256).expandDims();
  const out=net.runMobilenet(input,net.params),cells=out.shape[1],anchors=net.config.anchors.length;
  const logits=out.reshape([cells,cells,anchors,net.boxEncodingSize]).slice([0,0,0,4],[cells,cells,anchors,1]);
  return tf.logSumExp(logits);
 });
}
function optimizeStep(api,base,patch,rects,size,rate=.04){
 const tf=api.tf;
 return tf.tidy(()=>{
  const gradient=tf.grad(p=>objective(api,base,p,rects,size))(patch);
  return patch.sub(gradient.sign().mul(rate)).clipByValue(0,1);
 });
}
const core={disposeSampler,iou,composite,objective,optimizeStep};
if(typeof module==='object'&&module.exports)module.exports=core;else root.FaceLabCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
