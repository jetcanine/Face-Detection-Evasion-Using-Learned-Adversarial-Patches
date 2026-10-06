// Classic worker keeps MediaPipe WASM inference off the preview thread
self.exports={};
importScripts('../vendor/mediapipe/vision_bundle.js');
let landmarker;
self.onmessage=async({data})=>{
 const {id,bitmap}=data;
 try{
  if(data.type==='init'){
   const files=await exports.FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm',self.location.href).href);
   landmarker=await exports.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../models/face_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
   self.postMessage({id,ready:true});return;
  }
  const result=landmarker.detectForVideo(bitmap,performance.now());
  const points=result.faceLandmarks[0]?.map(p=>({x:p.x*384,y:p.y*384,z:p.z*384}))||null;
  self.postMessage({id,points});
 }catch(e){self.postMessage({id,error:e.message||String(e)})}
 finally{bitmap?.close()}
};
