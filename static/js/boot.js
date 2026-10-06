/* Keep the camera controls independent of large model downloads. */
(function(){
 const appURL=new URL('app.js',document.currentScript.src).href;
 const button=document.getElementById('camera'),notice=document.getElementById('notice');
 let done=false;
 function fail(message){if(done)return;done=true;clearTimeout(timer);notice.textContent=message+' Reload this page, or open the site directly in Chrome.';notice.classList.add('error');button.textContent='Reload page';button.disabled=false;button.onclick=()=>location.reload()}
 const timer=setTimeout(()=>fail('Camera controls did not finish loading.'),20000);
 window.addEventListener('error',event=>{if(!window.FaceLabReady)fail('Camera controls could not start: '+(event.message||'a required file failed to load.'))});
 const script=document.createElement('script');script.src=appURL;script.onerror=()=>fail('The camera script could not be downloaded.');script.onload=()=>{if(!window.FaceLabReady){fail('Camera controls could not initialize.');return}done=true;clearTimeout(timer);notice.textContent='Ready. Start the camera to begin. Frames stay on your device.'};document.head.append(script);
})();
