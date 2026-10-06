/* Shared rasterizer: live view and differentiable calibration use the same UV mapping,
   depth test, visibility and surface shading. Coordinates are estimated, not depth scans. */
(function(root){
'use strict';
const cache=new Map();
function inside(method,x,y){
 if(method==='cheeks')return ((Math.abs(x)-4.2)/1.7)**2+((y+1)/1.6)**2<=1;
 if(method==='forehead')return (x/4.4)**4+((y-6.525)/1.275)**4<=1;
 return Math.abs(x)<6&&y<.15-.35*Math.abs(x)&&y> -8.1+.075*x*x;
}
function raster(points,method,size,data){
 const region=data.regions[method];if(!points||points.length<468||!region)return null;
 const ids=new Set(region.triangles.flat()),p=points.map(a=>({x:a.x*size/384,y:a.y*size/384,z:a.z*size/384}));
 const selected=[...ids].map(i=>p[i]);
 const x0=Math.max(0,Math.min(size-1,Math.floor(Math.min(...selected.map(a=>a.x))))),y0=Math.max(0,Math.min(size-1,Math.floor(Math.min(...selected.map(a=>a.y)))));
 const w=Math.max(1,Math.min(size,Math.ceil(Math.max(...selected.map(a=>a.x))))-x0),h=Math.max(1,Math.min(size,Math.ceil(Math.max(...selected.map(a=>a.y))))-y0),n=w*h;
 const depth=new Float32Array(n).fill(Infinity),u=new Float32Array(n),v=new Float32Array(n),shade=new Float32Array(n),mask=new Float32Array(n);
 const key=t=>t.slice().sort((a,b)=>a-b).join(',');
 let stored=cache.get(region);if(!stored){const chosen=new Set(region.triangles.map(key)),existing=new Set(data.triangles.map(key)),all=data.triangles.concat(region.triangles.filter(t=>!existing.has(key(t))));stored=all.map(tri=>({tri,painted:chosen.has(key(tri))}));cache.set(region,stored)}
 const all=stored;
 for(const {tri,painted} of all){
  const [a,b,c]=tri.map(i=>p[i]);const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<.02)continue;
  const uv=tri.map(i=>region.uv[i]);
  const nx=(b.y-a.y)*(c.z-a.z)-(b.z-a.z)*(c.y-a.y),ny=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z),nz=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),light=.72+.28*Math.abs(nz)/(Math.hypot(nx,ny,nz)||1);
  const xa=Math.max(x0,Math.floor(Math.min(a.x,b.x,c.x))),xb=Math.min(x0+w-1,Math.ceil(Math.max(a.x,b.x,c.x))),ya=Math.max(y0,Math.floor(Math.min(a.y,b.y,c.y))),yb=Math.min(y0+h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++){
   const aa=((b.y-c.y)*(x+.5-c.x)+(c.x-b.x)*(y+.5-c.y))/den,bb=((c.y-a.y)*(x+.5-c.x)+(a.x-c.x)*(y+.5-c.y))/den,cc=1-aa-bb;
   if(aa<-.00001||bb<-.00001||cc<-.00001)continue;
   const k=(y-y0)*w+x-x0,z=aa*a.z+bb*b.z+cc*c.z;if(z>depth[k]+.001)continue;depth[k]=z;mask[k]=painted?1:0;
   if(painted){u[k]=aa*uv[0][0]+bb*uv[1][0]+cc*uv[2][0];v[k]=aa*uv[0][1]+bb*uv[1][1]+cc*uv[2][1];shade[k]=light;const [xmin,ymin,xmax,ymax]=region.bounds;if(!inside(method,xmin+u[k]*(xmax-xmin),ymax-v[k]*(ymax-ymin)))mask[k]=0}
  }
 }
 const indices=Array.from({length:4},()=>new Int32Array(n)),weights=Array.from({length:4},()=>new Float32Array(n));
 for(let k=0;k<n;k++)if(mask[k]){
  const px=Math.max(0,Math.min(15,u[k]*16-.5)),py=Math.max(0,Math.min(15,v[k]*16-.5)),xx=Math.floor(px),yy=Math.floor(py),x1=Math.min(15,xx+1),y1=Math.min(15,yy+1),fx=px-xx,fy=py-yy;
  indices[0][k]=yy*16+xx;indices[1][k]=yy*16+x1;indices[2][k]=y1*16+xx;indices[3][k]=y1*16+x1;
  weights[0][k]=(1-fx)*(1-fy)*shade[k];weights[1][k]=fx*(1-fy)*shade[k];weights[2][k]=(1-fx)*fy*shade[k];weights[3][k]=fx*fy*shade[k];
 }
 return {x:x0,y:y0,width:w,height:h,mask,indices,weights,padding:[[y0,size-y0-h],[x0,size-x0-w],[0,0]]};
}
function sampler(tf,r){const count=r.width*r.height;return {...r,indices:r.indices.map(a=>tf.tensor1d(a,'int32')),weights:r.weights.map(a=>tf.tensor2d(a,[count,1])),mask:tf.tensor3d(r.mask,[r.height,r.width,1])}}
function pixels(r,patch){const rgba=new Uint8ClampedArray(r.width*r.height*4);for(let k=0;k<r.mask.length;k++)if(r.mask[k]){for(let c=0;c<3;c++){let v=0;for(let j=0;j<4;j++)v+=(patch?patch[r.indices[j][k]*3+c]:.5)*r.weights[j][k];rgba[k*4+c]=Math.round(v*255)}rgba[k*4+3]=255}return rgba}
function pose(points){const a=points[234],b=points[454],nose=points[1],width=Math.hypot(b.x-a.x,b.y-a.y);return width<25?null:((nose.x-(a.x+b.x)/2)*(b.x-a.x)+(nose.y-(a.y+b.y)/2)*(b.y-a.y))/(width*width)}
const api={raster,sampler,pixels,pose};if(typeof module==='object'&&module.exports)module.exports=api;else root.FaceMesh=api;
})(globalThis);
