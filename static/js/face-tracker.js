/* MediaPipe component. Owns worker startup, requests, timeouts and cleanup.
   The UI only calls init(), detect(ImageBitmap), and close(). */
(function(root){
'use strict';
class FaceTracker {
 constructor(workerURL){this.workerURL=workerURL;this.worker=null;this.pending=new Map();this.nextId=1;this.ready=null;}
 init(){
  if(this.ready)return this.ready;
  this.worker=new Worker(this.workerURL);
  this.worker.onmessage=({data})=>{
   const request=this.pending.get(data.id);if(!request)return;
   clearTimeout(request.timer);this.pending.delete(data.id);
   data.error?request.reject(Error(data.error)):request.resolve(data.id===0?true:data.points);
  };
  this.worker.onerror=()=>this.close(Error('Face tracking could not start or stopped unexpectedly. Restart the camera.'));
  this.ready=this.request({type:'init',id:0},[],60000).catch(e=>{this.close(e);throw e});
  return this.ready;
 }
 request(data,transfer=[],timeout=15000){
  return new Promise((resolve,reject)=>{
   if(!this.worker){data.bitmap?.close();reject(Error('Face tracker is not running.'));return}
   const timer=setTimeout(()=>{this.pending.delete(data.id);reject(Error('Face tracker timed out. Restart the camera.'))},timeout);
   this.pending.set(data.id,{resolve,reject,timer});
   try{this.worker.postMessage(data,transfer)}catch(e){clearTimeout(timer);this.pending.delete(data.id);data.bitmap?.close();reject(e)}
  });
 }
 detect(bitmap){return this.request({id:this.nextId++,bitmap},[bitmap])}
 close(error=Error('Camera stopped')){
  this.worker?.terminate();this.worker=null;
  for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error)}
  this.pending.clear();this.ready=null;
 }
}
root.FaceTracker=FaceTracker;
})(globalThis);
