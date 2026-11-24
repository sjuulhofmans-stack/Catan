// Dobbelanimatie: kopie van Dobbelstenen/code/dice.js met twee aanpassingen voor het bord
// (gooien vanuit de hoek van de speler, landen binnen het bord). Zie randomThrow() en run().
// Let op: ES-module met three.js/cannon-es van esm.sh, werkt dus alleen online (niet via dubbelklik).
import * as THREE from 'https://esm.sh/three@0.160.0';
import * as CANNON from 'https://esm.sh/cannon-es@0.20.0';
const TAU=Math.PI*2,G=500,FPS=60,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),R=Math.random,rr=(a,b)=>a+R()*(b-a);
const RY={body:'#c4161b',pip:'#e9d01c',rough:.28},YR={body:'#f3cf0e',pip:'#c0221a',rough:.28};
const SCHEMES={'rood/geel':[RY,YR],ivoor:[{body:'#efe6d1',pip:'#1c1915',rough:.36}],rood:[{body:'#9c1c17',pip:'#f5efe3',rough:.3}],zwart:[{body:'#1f1d1b',pip:'#ecdfc4',rough:.34}]};
const A=.27,M=.5,Z=.73,PIPS={1:[[M,M]],2:[[A,A],[Z,Z]],3:[[A,A],[M,M],[Z,Z]],4:[[A,A],[Z,A],[A,Z],[Z,Z]],5:[[A,A],[Z,A],[A,Z],[Z,Z],[M,M]],6:[[A,A],[A,M],[A,Z],[Z,A],[Z,M],[Z,Z]]};
const FACE_VALS=[1,6,2,5,3,4],FACE_N=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(a=>new THREE.Vector3(...a));
const DIRS=['rechts','rechtsonder','onder','linksonder','links','linksboven','boven','rechtsboven'];

function roundedBox(size,r,seg){const g=new THREE.BoxGeometry(size,size,size,seg,seg,seg),p=g.attributes.position,n=g.attributes.normal,h=size/2-r,v=new THREE.Vector3(),c=new THREE.Vector3(),d=new THREE.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);c.set(cl(v.x,-h,h),cl(v.y,-h,h),cl(v.z,-h,h));d.copy(v).sub(c).normalize();v.copy(c).addScaledVector(d,r);p.setXYZ(i,v.x,v.y,v.z);n.setXYZ(i,d.x,d.y,d.z);}
  p.needsUpdate=n.needsUpdate=true;return g;}
function faceMaps(v,sc){const N=512,mk=()=>{const c=document.createElement('canvas');c.width=c.height=N;return[c,c.getContext('2d')];},[c1,x]=mk(),[c2,b]=mk();
  x.fillStyle=sc.body;x.fillRect(0,0,N,N);for(let i=0;i<2500;i++){x.fillStyle=R()<.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.035)';x.fillRect(R()*N,R()*N,1+R()*3,1+R()*3);}
  b.fillStyle='#fff';b.fillRect(0,0,N,N);const pr=N*.082;
  PIPS[v].forEach(([u,w])=>{const px=u*N,py=w*N;let g=x.createRadialGradient(px,py,0,px,py,pr*1.12);g.addColorStop(0,sc.pip);g.addColorStop(.82,sc.pip);g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.beginPath();x.arc(px,py,pr*1.12,0,TAU);x.fill();
    x.strokeStyle='rgba(0,0,0,.28)';x.lineWidth=pr*.14;x.beginPath();x.arc(px,py,pr*.98,Math.PI*1.05,Math.PI*1.95);x.stroke();x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=pr*.1;x.beginPath();x.arc(px,py,pr*.95,Math.PI*.1,Math.PI*.9);x.stroke();
    g=b.createRadialGradient(px,py,0,px,py,pr*1.15);g.addColorStop(0,'#1a1a1a');g.addColorStop(.6,'#3a3a3a');g.addColorStop(.88,'#b8b8b8');g.addColorStop(1,'#fff');b.fillStyle=g;b.beginPath();b.arc(px,py,pr*1.15,0,TAU);b.fill();});
  const map=new THREE.CanvasTexture(c1);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;const bump=new THREE.CanvasTexture(c2);return{map,bump};}
function envMap(r){const s=new THREE.Scene();s.add(new THREE.Mesh(new THREE.BoxGeometry(20,20,20),new THREE.MeshBasicMaterial({color:0x5e554c,side:THREE.BackSide})));
  const add=(w,h,pos,k,col)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(...pos);m.lookAt(0,0,0);s.add(m);};
  add(8,8,[-5,9,-5],6,'#fff3e0');add(6,3,[7,5,3],2.2,'#e6edff');add(4,4,[3,8,6],1.5,'#ffffff');add(19,19,[0,-9.8,0],.7,'#9a7a4c');
  const pm=new THREE.PMREMGenerator(r),t=pm.fromScene(s,.04).texture;pm.dispose();return t;}
function blobTex(){const N=128,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d'),g=x.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.45,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,N,N);return new THREE.CanvasTexture(c);}
function randQuat(){const u=R(),v=R(),w=R();return[Math.sqrt(1-u)*Math.sin(TAU*v),Math.sqrt(1-u)*Math.cos(TAU*v),Math.sqrt(u)*Math.sin(TAU*w),Math.sqrt(u)*Math.cos(TAU*w)];}
function randVec(m){const a=R()*TAU,z=R()*2-1,s=Math.sqrt(1-z*z);return[Math.cos(a)*s*m,z*m,Math.sin(a)*s*m];}

const STYLES=[['worp',.3],['rol',.22],['schuif',.12],['hard',.16],['val',.12],['spin',.08]];
const SNAME={worp:'boogworp',rol:'lage rol',schuif:'schuivend',hard:'harde worp',val:'val van hoog',spin:'tollend'};
const MODE2={naast:'naast elkaar',achter:'achter elkaar',spreid:'uiteenlopend',samen:'tegen elkaar'};

export class DiceRoller{
  constructor(host,o={}){this.host=host;this.onResult=o.onResult;
    const r=this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r.setPixelRatio(Math.min(2,devicePixelRatio));r.outputColorSpace=THREE.SRGBColorSpace;
    r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.05;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;r.setClearColor(0,0);
    r.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';host.appendChild(r.domElement);
    this.scene=new THREE.Scene();this.scene.environment=envMap(r);this.cam=new THREE.PerspectiveCamera(24,1,.1,1000);
    const dl=this.dl=new THREE.DirectionalLight(0xfff0d8,2.3);dl.castShadow=true;dl.shadow.mapSize.set(2048,2048);dl.shadow.bias=-.0004;dl.shadow.normalBias=.03;this.scene.add(dl,dl.target);
    this.scene.add(new THREE.HemisphereLight(0xfff4e6,0x5a4a35,.35));
    const gp=this.ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.4}));gp.rotation.x=-Math.PI/2;gp.receiveShadow=true;this.scene.add(gp);
    this.geo=roundedBox(1,.15,12);const bt=blobTex();
    this.dice=[0,1].map(()=>{const outer=new THREE.Group(),inner=new THREE.Mesh(this.geo,[]);inner.castShadow=true;outer.add(inner);outer.visible=false;this.scene.add(outer);
      const blob=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:bt,color:0,transparent:true,depthWrite:false,opacity:0}));blob.rotation.x=-Math.PI/2;blob.position.y=.002;blob.visible=false;this.scene.add(blob);return{outer,inner,blob};});
    this.setColor(o.color||'rood/geel');this.view=10;this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(host);this.resize();
    this.loop=this.loop.bind(this);this.raf=requestAnimationFrame(this.loop);}
  setColor(name){const set=SCHEMES[name]||SCHEMES['rood/geel'];if(this.colorName===name)return;this.colorName=name;const old=this.mats;
    const sets=set.map(sc=>FACE_VALS.map(v=>{const{map,bump}=faceMaps(v,sc);return new THREE.MeshPhysicalMaterial({map,bumpMap:bump,bumpScale:2.5,roughness:sc.rough,clearcoat:.75,clearcoatRoughness:.15,sheen:.2,transparent:true});}));
    this.dice.forEach((d,i)=>d.inner.material=sets[i%sets.length]);this.mats=sets.flat();if(old)old.forEach(m=>{m.map.dispose();m.bumpMap.dispose();m.dispose();});this.dirty=true;}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.aspect=w/h;this.updateCam();}
  setView(wd){if(Math.abs(wd-this.view)<.01)return;this.view=wd;this.updateCam();this.hide();}
  hide(){this.play=null;this.fade=null;this.dice.forEach(d=>{d.outer.visible=false;d.blob.visible=false;});this.dirty=true;}
  updateCam(){const a=this.aspect||1,hx=this.view/2,hz=hx/a,Hc=hz/Math.tan(this.cam.fov*Math.PI/360);Object.assign(this,{hx,hz,Hc});
    const c=this.cam;c.aspect=a;c.position.set(0,Hc,0);c.up.set(0,0,-1);c.lookAt(0,0,0);c.near=Hc*.05;c.far=Hc*3;c.updateProjectionMatrix();
    this.dl.position.set(-hx*.9,Hc*.8,-hz*.9);const s=this.dl.shadow.camera,e=Math.max(hx,hz)*1.5;Object.assign(s,{left:-e,right:e,top:e,bottom:-e,near:.1,far:Hc*3});s.updateProjectionMatrix();
    this.ground.scale.set(hx*5,hz*5,1);this.dirty=true;}
  // Aanpassing De kolonisten van Gennep: o.from = richting (radialen, vanaf het midden) waar de speler zit,
  // o.landR = straal rond het midden waarbinnen de stenen moeten landen (het bord).
  randomThrow(o={}){const hx=this.hx,hz=this.hz,u=R()*STYLES.reduce((s,x)=>s+x[1],0);let st='worp',acc=0;for(const[k,w]of STYLES){acc+=w;if(u<=acc){st=k;break;}}
    const th=o.from!=null?o.from+rr(-.3,.3):R()*TAU,c=Math.cos(th),s=Math.sin(th),k=Math.min((hx+2.2)/Math.max(1e-6,Math.abs(c)),(hz+2.2)/Math.max(1e-6,Math.abs(s))),sx=c*k,sz=s*k;
    let tx,tz;if(o.landR){const ta=R()*TAU,tr=Math.sqrt(R())*o.landR*.55;tx=Math.cos(ta)*tr;tz=Math.sin(ta)*tr;}else{tx=(R()-.5)*hx*1.1;tz=(R()-.5)*hz*1.1;}
    let dx=tx-sx,dz=tz-sz;const D=Math.hypot(dx,dz);dx/=D;dz/=D;const hm=this.Hc*.35;
    const mk=(ddx,ddz,ox,oz,sf)=>{let h,a,vy,w;const ax=[ddz,0,-ddx];
      if(st==='worp'){h=rr(1.5,5);a=rr(60,200);vy=rr(5,18);w=randVec(rr(15,40));}
      else if(st==='rol'){h=rr(.6,1);a=rr(40,140);vy=rr(0,3);w=null;}
      else if(st==='schuif'){h=rr(.52,.6);a=rr(130,210);vy=0;w=[rr(-2,2),rr(-8,8),rr(-2,2)];}
      else if(st==='hard'){h=rr(1,3);a=rr(200,420);vy=rr(8,20);w=randVec(rr(30,60));}
      else if(st==='val'){h=rr(8,14);a=rr(40,120);vy=rr(-2,2);w=randVec(rr(10,30));}
      else{h=rr(.6,1.4);a=rr(90,200);vy=rr(1,5);w=[rr(-4,4),(R()<.5?-1:1)*rr(30,55),rr(-4,4)];}
      h=Math.min(h,hm);const vh=Math.sqrt(2*a*D)*sf;
      if(!w){const m=vh/.5*rr(.55,1.15);w=[ax[0]*m+rr(-5,5),rr(-5,5),ax[2]*m+rr(-5,5)];}
      return{p:[sx+ox,h,sz+oz],q:randQuat(),v:[ddx*vh,vy,ddz*vh],w,delay:0};};
    const m2=['naast','naast','achter','spreid','samen'][R()*5|0],px=-dz,pz=dx,sg=R()<.5?-1:1,d1=mk(dx,dz,0,0,1);let d2;
    if(m2==='naast'){const o=rr(1.2,2.6)*sg;d2=mk(dx,dz,px*o,pz*o,rr(.88,1.12));d2.delay=rr(0,.08);}
    else if(m2==='achter'){const o=rr(1.3,3),l=rr(-.8,.8);d2=mk(dx,dz,-dx*o+px*l,-dz*o+pz*l,rr(.9,1.15));d2.delay=rr(.05,.3);}
    else if(m2==='spreid'){const r=sg*rr(.12,.35),cr=Math.cos(r),sr=Math.sin(r),o=rr(.8,1.6)*sg;d2=mk(dx*cr-dz*sr,dx*sr+dz*cr,px*o,pz*o,rr(.85,1.15));d2.delay=rr(0,.12);}
    else{const o=rr(1.05,1.3)*sg;d2=mk(dx,dz,px*o,pz*o,rr(.97,1.03));d2.v[0]-=px*o*rr(1,4);d2.v[2]-=pz*o*rr(1,4);}
    return{dice:[d1,d2],landR:o.landR||0,info:{style:SNAME[st],from:DIRS[((Math.round(th/(Math.PI/4))%8)+8)%8],mode:MODE2[m2]}};}
  run(P){const w=new CANNON.World({gravity:new CANNON.Vec3(0,-G,0)});w.allowSleep=true;w.solver.iterations=14;
    const mD=new CANNON.Material(),mT=new CANNON.Material();w.addContactMaterial(new CANNON.ContactMaterial(mD,mT,{friction:.34,restitution:.32}));w.addContactMaterial(new CANNON.ContactMaterial(mD,mD,{friction:.22,restitution:.45}));
    const g=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:mT});g.quaternion.setFromEuler(-Math.PI/2,0,0);w.addBody(g);
    const B=P.dice.map(d=>{const b=new CANNON.Body({mass:1,shape:new CANNON.Box(new CANNON.Vec3(.5,.5,.5)),material:mD,linearDamping:.05,angularDamping:.09,allowSleep:true,sleepSpeedLimit:.3,sleepTimeLimit:.25});
      b.position.set(...d.p);b.quaternion.set(...d.q);b.velocity.set(...d.v);b.angularVelocity.set(...d.w);return b;});
    const added=[0,0],fr=[[],[]],dt=1/240;let t=0,n=0;
    while(t<9){B.forEach((b,i)=>{if(!added[i]&&t>=P.dice[i].delay){w.addBody(b);added[i]=1;}});w.step(dt);t+=dt;n++;
      if(n%4===0)B.forEach((b,i)=>fr[i].push([b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w]));
      if(added[0]&&added[1]&&B.every(b=>b.sleepState===CANNON.Body.SLEEPING))break;}
    for(let k=0;k<6;k++)B.forEach((b,i)=>fr[i].push(fr[i][fr[i].length-1]));
    const fin=fr.map(f=>f[f.length-1]),q=new THREE.Quaternion(),up=new THREE.Vector3();let ok=true,score=0;
    fin.forEach(f=>{q.set(f[3],f[4],f[5],f[6]);up.set(0,1,0).applyQuaternion(q.invert());const m=Math.max(...[up.x,up.y,up.z].map(Math.abs));
      // Met landR wordt de plek later bepaald door fit(); hier alleen: plat en stil op tafel
      const inX=P.landR?0:this.hx-1-Math.abs(f[0]),inZ=P.landR?0:this.hz-1-Math.abs(f[2]);
      if(m<.985||f[1]>.65||inX<0||inZ<0)ok=false;score+=Math.min(inX,inZ,0)+(m-1)*10;});
    return{frames:fr,final:fin,ok,score};}
  // Een worp op een vlakke tafel blijft natuurkundig gelijk als je hem verschuift. Verschuif de hele worp zodat
  // de stenen binnen o.landR eindigen, mits ze dan nog van buiten beeld en uit de richting o.from komen.
  fit(r,o){const fin=r.final,mx=(fin[0][0]+fin[1][0])/2,mz=(fin[0][2]+fin[1][2])/2,ta=R()*TAU,tr=Math.sqrt(R())*o.landR*.45;
    const dx=Math.cos(ta)*tr-mx,dz=Math.sin(ta)*tr-mz,ux=Math.cos(o.from),uz=Math.sin(o.from);
    if(fin.some(f=>Math.hypot(f[0]+dx,f[2]+dz)>o.landR-.7))return null;
    for(const fr of r.frames){const s=fr[0],sx=s[0]+dx,sz=s[2]+dz;if(Math.abs(sx)<this.hx+.8&&Math.abs(sz)<this.hz+.8)return null;if(sx*ux+sz*uz<=0)return null;}
    const seen=new Set();r.frames.forEach(fr=>fr.forEach(p=>{if(seen.has(p))return;seen.add(p);p[0]+=dx;p[2]+=dz;}));return r;}
  simulate(o){let best=null;for(let i=0;i<40;i++){const P=this.randomThrow(o),r=this.run(P);r.info=P.info;
      if(r.ok&&o&&o.landR){for(let k=0;k<6;k++){const s=this.fit(r,o);if(s)return s;}continue;}
      if(r.ok)return r;if(!best||r.score>best.score)best=r;}return best||this.run(this.randomThrow());}
  roll(force,o){const res=this.simulate(o);this.pending={res,force:force||[]};if(this.dice[0].outer.visible&&!this.fade){this.fade=performance.now();this.play=null;}else if(!this.fade)this.start();this.dirty=true;return res.info;}
  start(){const{res,force}=this.pending;this.pending=null;const vals=[],q=new THREE.Quaternion(),up=new THREE.Vector3();
    res.final.forEach((f,i)=>{q.set(f[3],f[4],f[5],f[6]).invert();up.set(0,1,0).applyQuaternion(q);let k=0,bd=-2;FACE_N.forEach((n,j)=>{const d=n.dot(up);if(d>bd){bd=d;k=j;}});
      const want=force[i]>=1&&force[i]<=6?force[i]:FACE_VALS[k],idx=FACE_VALS.indexOf(want);this.dice[i].inner.quaternion.setFromUnitVectors(FACE_N[idx],FACE_N[k]);vals.push(want);});
    this.mats.forEach(m=>m.opacity=1);this.dice.forEach(d=>{d.outer.visible=true;d.blob.visible=true;});this.play={res,t0:performance.now(),vals};}
  loop(now){this.raf=requestAnimationFrame(this.loop);
    if(this.fade){const k=(now-this.fade)/240;if(k>=1){this.fade=null;this.start();}else{this.mats.forEach(m=>m.opacity=1-k);this.dice.forEach(d=>{d.outer.position.y+=.04;d.blob.material.opacity*=.9;});this.renderer.render(this.scene,this.cam);return;}}
    if(this.play){const P=this.play,f=Math.max(0,(now-P.t0)/1000*FPS),/* rAF-tijd kan vóór t0 liggen: niet negatief */q1=new THREE.Quaternion(),q2=new THREE.Quaternion();let done=true;
      P.res.frames.forEach((fr,i)=>{const L=fr.length,j=Math.min(Math.floor(f),L-2),u=cl(f-j,0,1),a=fr[j],b=fr[j+1],d=this.dice[i];if(f<L-1)done=false;
        d.outer.position.set(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u);q1.set(a[3],a[4],a[5],a[6]);q2.set(b[3],b[4],b[5],b[6]);d.outer.quaternion.slerpQuaternions(q1,q2,u);
        const y=d.outer.position.y;d.blob.position.x=d.outer.position.x+.06;d.blob.position.z=d.outer.position.z+.06;d.blob.material.opacity=.5*cl(1-(y-.5)/3,0,1);d.blob.scale.setScalar(1+Math.max(0,y-.5)*.25);});
      this.renderer.render(this.scene,this.cam);
      if(done){const v=P.vals;this.play=null;const det={a:v[0],b:v[1],sum:v[0]+v[1],...P.res.info};this.onResult&&this.onResult(det);window.dispatchEvent(new CustomEvent('dice-result',{detail:det}));}return;}
    if(this.dirty){this.dirty=false;this.renderer.render(this.scene,this.cam);}}
  dispose(){cancelAnimationFrame(this.raf);this.ro.disconnect();this.renderer.dispose();this.renderer.domElement.remove();}
}
window.DiceRoller=DiceRoller;
