/* EVOQUEST deck controller: the original presentation script (tree, text reveals, navigation, HUD),
   now driving a Three.js world (with the original canvas renderer as fallback) plus synthesised sound. */
import { createWorld3D, detectTier } from './world/world3d.js';
import { createWorld2D } from './world/world2d.js';
import { createSFX } from './sfx.js';

export function startDeck(){
'use strict';
var $=function(s){return document.querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var stage=$('#stage'), slides=$$('.slide'), N=slides.length;
var NAMES=['EVOQUEST','The Inspiration','The Problem','The Game Concept','Gameplay & Design','Tree of Science','What Makes It Different','Target Audience','Development Process','Our Vision'];
var reduced=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
var sfx=createSFX();

/* =========================================================
   THE TREE OF SCIENCE (generated SVG + HTML labels)
   ========================================================= */
var BR=[ /* order = growth order (bottom-up, alternating sides) */
  {n:'Geology',d:"The study of Earth's structure, materials, history, and processes.",s:-1,o:632,x:612,y:640,c:'#8fc4ff',ic:'geo'},
  {n:'Environmental Science',d:'The study of the environment and interactions between natural systems and human activities.',s:1,o:632,x:1308,y:640,c:'#5fd4ff',ic:'env'},
  {n:'Biology',d:'The study of living organisms and life processes.',s:-1,o:556,x:520,y:512,c:'#6ff2c8',ic:'bio'},
  {n:'Ecology',d:'The study of relationships between organisms and their environment.',s:1,o:556,x:1400,y:512,c:'#86e8b0',ic:'eco'},
  {n:'Physics',d:'The study of matter, energy, motion, forces, and how the physical universe works.',s:-1,o:482,x:578,y:380,c:'#22e6ff',ic:'phys',em:1},
  {n:'Chemistry',d:'The study of substances, their properties, composition, and reactions.',s:1,o:482,x:1342,y:380,c:'#a48dff',ic:'chem',em:1},
  {n:'Astronomy',d:'The study of celestial objects, space, planets, stars, and the universe.',s:-1,o:412,x:716,y:222,c:'#b9a8ff',ic:'astro'},
  {n:'Computer Science',d:'The study of computation, algorithms, programming, and information systems.',s:1,o:412,x:1204,y:222,c:'#d4f1ff',ic:'cs'}
];
var ICON={
  phys:'<ellipse rx="13" ry="5"/><ellipse rx="13" ry="5" transform="rotate(60)"/><ellipse rx="13" ry="5" transform="rotate(-60)"/><circle r="2.2" fill="currentColor" stroke="none"/>',
  chem:'<path d="M-4 -12 L-4 -3 L-10 8 Q-11.5 11 -8 11 L8 11 Q11.5 11 10 8 L4 -3 L4 -12 M-6.5 -12 L6.5 -12 M-7.5 4 L7.5 4"/>',
  bio:'<path d="M-6 -12 C6 -8 6 -4 -6 0 C6 4 6 8 -6 12 M6 -12 C-6 -8 -6 -4 6 0 C-6 4 -6 8 6 12 M-2.5 -9 L2.5 -9 M-2.5 -3 L2.5 -3 M-2.5 3 L2.5 3 M-2.5 9 L2.5 9"/>',
  astro:'<circle r="6.5"/><ellipse rx="14" ry="4" transform="rotate(-22)"/><circle cx="10" cy="-10" r="1.3" fill="currentColor" stroke="none"/>',
  geo:'<path d="M-12 -1 L-4 -10 L1 -5 L5 -8 L12 -1 Z M-12 4 L12 4 M-12 9 L12 9"/>',
  eco:'<path d="M-9 10 C-10 -3 -1 -11 11 -10 C11 1 3 10 -9 10 Z M-9 10 L4 -3"/>',
  env:'<circle r="11"/><ellipse rx="4.6" ry="11"/><path d="M-11 0 L11 0 M-9 -6 L9 -6 M-9 6 L9 6"/>',
  cs:'<path d="M-5 -8 L-12 0 L-5 8 M5 -8 L12 0 L5 8 M2.5 -11 L-2.5 11"/>'
};
function bez(p0,p1,p2,p3,u){var v=1-u;return[v*v*v*p0[0]+3*v*v*u*p1[0]+3*v*u*u*p2[0]+u*u*u*p3[0],v*v*v*p0[1]+3*v*v*u*p1[1]+3*v*u*u*p2[1]+u*u*u*p3[1]]}
function f1(n){return Math.round(n*10)/10}
function buildTree(){
  var svg=$('#treeSvg'), labs=$('#treeLabels'); if(!svg||!labs) return;
  var CX=960, SEED=540, TOP=398, BASE=782, h=[], L=[], pulses=[];
  h.push('<defs>'+
    '<radialGradient id="rgw"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".25" stop-color="#9ff3ff" stop-opacity=".6"/><stop offset="1" stop-color="#22e6ff" stop-opacity="0"/></radialGradient>'+
    '<radialGradient id="rgc"><stop offset="0" stop-color="#22e6ff" stop-opacity=".55"/><stop offset="1" stop-color="#22e6ff" stop-opacity="0"/></radialGradient>'+
    '<linearGradient id="cone" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#22e6ff" stop-opacity=".16"/><stop offset=".6" stop-color="#22e6ff" stop-opacity=".04"/><stop offset="1" stop-color="#22e6ff" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="trk" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#22e6ff"/><stop offset=".5" stop-color="#e6fbff"/><stop offset="1" stop-color="#22e6ff"/></linearGradient>'+
    '<linearGradient id="rootg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22e6ff" stop-opacity="0"/><stop offset=".5" stop-color="#22e6ff" stop-opacity=".9"/><stop offset="1" stop-color="#22e6ff" stop-opacity="0"/></linearGradient>'+
  '</defs>');
  /* holographic projector: light cone + platform rings */
  h.push('<path class="late" style="--t:2.3s" d="M905 790 L470 170 L1450 170 L1015 790 Z" fill="url(#cone)"/>');
  h.push('<ellipse class="pop" style="--t:1.7s" cx="960" cy="792" rx="300" ry="30" fill="url(#rgc)" opacity=".5"/>');
  [[280,26,.5,1.75],[200,19,.7,1.85],[120,11,.9,1.95]].forEach(function(e){
    h.push('<ellipse class="pop" style="--t:'+e[3]+'s" cx="960" cy="792" rx="'+e[0]+'" ry="'+e[1]+'" fill="none" stroke="#22e6ff" stroke-opacity="'+e[2]+'" stroke-width="1.2"/>');
  });
  /* roots */
  [[740,800],[810,814],[885,822],[1035,822],[1110,814],[1180,800]].forEach(function(r,i){
    h.push('<path class="grow" pathLength="1" style="--t:'+(1.7+i*.06)+'s;--dur:1.4s" d="M960 778 Q '+f1(960+(r[0]-960)*.35)+' '+(BASE+6)+' '+r[0]+' '+r[1]+'" fill="none" stroke="#22e6ff" stroke-opacity=".55" stroke-width="1.2"/>');
  });
  /* trunk: holographic fibres growing from the seed both ways */
  [-1,0,1].forEach(function(k){
    var dn='M960 '+SEED+' C960 640 '+(960+k*5)+' 720 '+(960+k*16)+' '+BASE, up='M960 '+SEED+' C960 480 '+(960+k*3)+' 440 '+f1(960+k*1.5)+' '+TOP;
    var w=k?1:2.6, op=k?.55:1, col=k?'#22e6ff':'url(#trk)';
    if(!k){
      h.push('<path class="grow glowL" pathLength="1" style="--t:1.2s;--dur:1.6s" d="'+dn+'" fill="none" stroke="#22e6ff" stroke-opacity=".16" stroke-width="16" stroke-linecap="round"/>');
      h.push('<path class="grow glowL" pathLength="1" style="--t:1.2s;--dur:1.6s" d="'+up+'" fill="none" stroke="#22e6ff" stroke-opacity=".16" stroke-width="16" stroke-linecap="round"/>');
    }
    h.push('<path class="grow" pathLength="1" style="--t:'+(1.2+Math.abs(k)*.12)+'s;--dur:1.6s" d="'+dn+'" fill="none" stroke="'+col+'" stroke-opacity="'+op+'" stroke-width="'+w+'" stroke-linecap="round"/>');
    h.push('<path class="grow" pathLength="1" style="--t:'+(1.2+Math.abs(k)*.12)+'s;--dur:1.6s" d="'+up+'" fill="none" stroke="'+col+'" stroke-opacity="'+op+'" stroke-width="'+w+'" stroke-linecap="round"/>');
  });
  /* knowledge network: faint links between neighbouring fields */
  var net=[[6,4],[4,2],[2,0],[7,5],[5,3],[3,1]];
  net.forEach(function(p,i){
    var a=BR[p[0]],b=BR[p[1]],mx=(a.x+b.x)/2+a.s*70,my=(a.y+b.y)/2;
    h.push('<path class="grow" pathLength="1" style="--t:'+(5.3+i*.08)+'s;--dur:1.6s" d="M'+a.x+' '+a.y+' Q'+mx+' '+my+' '+b.x+' '+b.y+'" fill="none" stroke="#9fdcff" stroke-opacity=".2" stroke-width="1" stroke-dasharray="1"/>');
  });
  /* branches */
  BR.forEach(function(b,i){
    var t=2.4+i*.34, s=b.s, ox=CX+s*2, oy=b.o, dx=b.x-CX, dy=b.y-oy;
    var P0=[ox,oy],P1=[CX+dx*.3,oy+dy*.08-18],P2=[CX+dx*.7,b.y-dy*.22+(dy>-30?10:0)],P3=[b.x-s*(b.em?30:24),b.y];
    var d='M'+f1(P0[0])+' '+f1(P0[1])+' C'+f1(P1[0])+' '+f1(P1[1])+' '+f1(P2[0])+' '+f1(P2[1])+' '+f1(P3[0])+' '+f1(P3[1]);
    var d2='M'+f1(P0[0])+' '+f1(P0[1]+4)+' C'+f1(P1[0])+' '+f1(P1[1]+12)+' '+f1(P2[0])+' '+f1(P2[1]+9)+' '+f1(P3[0])+' '+f1(P3[1]+3);
    var g='<g class="brg'+(b.em?' em':'')+'" style="color:'+b.c+'">';
    g+='<path class="grow glowL" pathLength="1" style="--t:'+t+'s;--dur:1.2s" d="'+d+'" fill="none" stroke="'+b.c+'" stroke-opacity="'+(b.em?.22:.13)+'" stroke-width="'+(b.em?14:10)+'" stroke-linecap="round"/>';
    g+='<path class="grow" pathLength="1" style="--t:'+t+'s;--dur:1.2s" d="'+d+'" fill="none" stroke="'+b.c+'" stroke-width="'+(b.em?2.6:1.7)+'" stroke-linecap="round"/>';
    g+='<path class="grow" pathLength="1" style="--t:'+(t+.1)+'s;--dur:1.3s" d="'+d2+'" fill="none" stroke="'+b.c+'" stroke-opacity=".45" stroke-width=".9"/>';
    [[.48,34,-26],[.74,26,24]].forEach(function(tw,j){
      var p=bez(P0,P1,P2,P3,tw[0]), ex=p[0]+s*tw[1], ey=p[1]+tw[2];
      g+='<path class="grow" pathLength="1" style="--t:'+(t+.45+j*.12)+'s;--dur:.8s" d="M'+f1(p[0])+' '+f1(p[1])+' Q'+f1(p[0]+s*tw[1]*.6)+' '+f1(p[1]+tw[2]*.15)+' '+f1(ex)+' '+f1(ey)+'" fill="none" stroke="'+b.c+'" stroke-opacity=".6" stroke-width="1"/>';
      g+='<circle class="pop" style="--t:'+(t+.95+j*.12)+'s" cx="'+f1(ex)+'" cy="'+f1(ey)+'" r="2.8" fill="'+b.c+'"/>';
    });
    var R=b.em?30:24, nt=t+.85;
    g+='<g transform="translate('+b.x+' '+b.y+')">';
    if(b.em) g+='<g class="late" style="--t:6.1s"><circle class="pring" r="'+R+'" fill="none" stroke="'+b.c+'" stroke-width="1.5"/><circle class="pring" style="animation-delay:1.4s" r="'+R+'" fill="none" stroke="'+b.c+'" stroke-width="1.5"/></g>';
    g+='<g class="pop" style="--t:'+nt+'s">';
    g+='<circle r="'+(R*2.1)+'" fill="url(#rgc)" opacity="'+(b.em?.9:.55)+'"/>';
    g+='<circle r="'+R+'" fill="#04122b" fill-opacity=".88" stroke="'+b.c+'" stroke-width="'+(b.em?2:1.4)+'"/>';
    if(b.em) g+='<circle r="'+(R+7)+'" fill="none" stroke="'+b.c+'" stroke-opacity=".6" stroke-width="1" stroke-dasharray="2 5"/>';
    g+='<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'+(b.em?' transform="scale(1.2)"':'')+'>'+ICON[b.ic]+'</g>';
    g+='</g></g>';
    g+='<path class="grow" pathLength="1" style="--t:'+(nt+.25)+'s;--dur:.6s" d="M'+(b.x+s*(R+4))+' '+b.y+' L'+(b.x+s*(R+16))+' '+b.y+'" fill="none" stroke="'+b.c+'" stroke-width="1.2"/>';
    g+='</g>';
    h.push(g);
    pulses.push({d:'M960 '+BASE+' L960 '+oy+' '+d.replace(/^M[^C]+/,''),c:b.c,em:b.em,i:i});
    /* HTML label */
    var lt=nt+.15, side=s<0?'L':'R', pos=s<0?'right:'+(1920-(b.x-R-24))+'px':'left:'+(b.x+R+24)+'px';
    L.push('<div class="tlab '+side+(b.em?' em':'')+'" style="'+pos+';top:'+(b.y-(b.em?30:24))+'px;--c:'+b.c+'">'+
      (b.em?'<span class="ttag late" style="--t:6.1s">Example in our game</span>':'')+
      '<div class="tnm" data-split data-d="'+Math.round(lt*1000-450)+'">'+b.n+'</div>'+
      '<div class="tdef" style="--d:'+Math.round(lt*1000-150)+'ms">'+b.d+'</div></div>');
  });
  /* knowledge pulses flowing from the roots into every branch */
  var pg='<g class="late" style="--t:6.4s">';
  pulses.forEach(function(p){
    var dur=(p.em?3.2:4.4)+(p.i%3)*.35, beg=(p.i*.47).toFixed(2);
    pg+='<g><circle r="'+(p.em?9:7)+'" fill="url(#rgw)" opacity=".7"/><circle r="'+(p.em?2.4:1.8)+'" fill="#fff"/>'+
        '<animateMotion dur="'+dur+'s" begin="'+beg+'s" repeatCount="indefinite" path="'+p.d+'" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".5 0 .5 1"/></g>';
  });
  pg+='</g>';
  h.push(pg);
  /* the seed: the glowing point everything grows from */
  h.push('<circle class="seedb" cx="960" cy="'+SEED+'" r="60" fill="url(#rgw)" style="transform-box:fill-box;transform-origin:center;opacity:0"/>');
  h.push('<circle class="seedc" cx="960" cy="'+SEED+'" r="6" fill="#fff"/>');
  svg.innerHTML=h.join('');
  labs.innerHTML=L.join('');
}
buildTree();

/* =========================================================
   TEXT SPLITTING
   ========================================================= */
function split(el,mode){
  var i=0, out=document.createDocumentFragment();
  if(el.dataset.d) el.style.setProperty('--d',el.dataset.d+'ms');
  (function walk(node,cls){
    Array.prototype.forEach.call(node.childNodes,function(n){
      if(n.nodeType===3){
        var toks=mode==='char'?Array.from(n.textContent):n.textContent.split(/(\s+)/);
        toks.forEach(function(tok){
          if(!tok) return;
          if(/^\s+$/.test(tok)){out.appendChild(document.createTextNode(' '));return;}
          var m=document.createElement('span');m.className='mask';
          var s=document.createElement('span');s.textContent=tok;s.style.setProperty('--i',i++);
          if(cls) s.className=cls;
          m.appendChild(s);out.appendChild(m);
        });
      }else if(n.nodeType===1){
        if(n.tagName==='BR'){out.appendChild(document.createElement('br'));return;}
        walk(n,((cls?cls+' ':'')+n.className).trim());
      }
    });
  })(el,'');
  if(!el.getAttribute('aria-label')) el.setAttribute('aria-label',el.textContent.replace(/\s+/g,' ').trim());
  el.textContent='';el.appendChild(out);
  $$('.mask',el).forEach(function(m){m.setAttribute('aria-hidden','true')});
}
function cascade(el){
  var w=0, out=document.createDocumentFragment();
  (function walk(node,dst){
    Array.prototype.slice.call(node.childNodes).forEach(function(n){
      if(n.nodeType===3){
        n.textContent.split(/(\s+)/).forEach(function(tok){
          if(!tok) return;
          if(/^\s+$/.test(tok)){dst.appendChild(document.createTextNode(' '));return}
          var s=document.createElement('span');s.className='w';s.style.setProperty('--w',w++);s.textContent=tok;dst.appendChild(s);
        });
      }else if(n.nodeType===1){var c=n.cloneNode(false);dst.appendChild(c);walk(n,c)}
    });
  })(el,out);
  el.textContent='';el.appendChild(out);el.classList.remove('rv');el.classList.add('wc');
}
$$('[data-split]').forEach(function(e){split(e,'word')});
$$('[data-letters]').forEach(function(e){split(e,'char')});
$$('.lede.rv,.foot.rv,.two p.rv,.row3 p,.aud p,.tl p,.vs .side p,.tdef,.btr span').forEach(cascade);
$$('.chips.rv').forEach(function(c){c.classList.remove('rv');c.classList.add('chq');$$('.chip',c).forEach(function(ch,i){ch.style.setProperty('--i',i)})});
/* slide-5 pixel skyline */
(function(){var p=$('.pix'),hs=[2,5,9,6,12,16,11,7,14,20,15,9,5,10,6,3];hs.forEach(function(h,i){var e=document.createElement('i');e.style.setProperty('--i',i);e.style.setProperty('--h',h);p.appendChild(e)})})();

/* decode-style scramble for mono labels */
var GLY='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>+=#';
$$('.scr').forEach(function(el){el.dataset.txt=el.textContent;el.setAttribute('aria-label',el.textContent)});
function msVar(el){var v=getComputedStyle(el).getPropertyValue('--d').trim();return v?parseFloat(v)*(/ms$/.test(v)?1:1000):0}
function scramble(el,delay,txt){
  var fin=txt||el.dataset.txt||el.textContent, len=fin.length, st=performance.now()+delay, lastU=0;
  if(el._scr) cancelAnimationFrame(el._scr);
  if(reduced){el.textContent=fin;return}
  el.textContent=fin.replace(/[^\s]/g,' ');
  if(!el.closest('.slide:not(.active)')) sfx.decode(delay);
  function tick(now){
    if(now<st||now-lastU<42){el._scr=requestAnimationFrame(tick);return}
    lastU=now;var e=now-st,out='',done=true;
    for(var i=0;i<len;i++){
      var ch=fin[i];
      if(ch===' '||e>=240+i*28){out+=ch}
      else{done=false;out+=e>=i*14?GLY[(Math.random()*GLY.length)|0]:' '}
    }
    el.textContent=out;
    el._scr=done?0:requestAnimationFrame(tick);
  }
  el._scr=requestAnimationFrame(tick);
}
function scrambleIn(root,excludePanel){
  $$('.scr',root).forEach(function(el){
    if(excludePanel&&el.closest('.s6-panel')) return;
    scramble(el,msVar(el)+450);
  });
}

/* =========================================================
   HUD + STAGE FIT
   ========================================================= */
var prog=$('#prog');
for(var p=0;p<N;p++){prog.appendChild(document.createElement('i'))}
function hud(n){
  var hn=$('#hn'); hn.textContent=(n<9?'0':'')+(n+1)+' / '+N; hn.classList.remove('tick'); void hn.offsetWidth; hn.classList.add('tick');
  scramble($('#hl'),0,NAMES[n]);
  $$('#prog i').forEach(function(b,i){b.classList.toggle('on',i<=n)});
}
function fit(){
  var s=Math.min(innerWidth/1920,innerHeight/1080);
  stage.style.transform='translate(-50%,-50%) scale('+s+')';
}

/* =========================================================
   3D WORLD: dependency-free perspective renderer on canvas 2D
   ========================================================= */
/* [camX,camY,camZ, lookX,lookY,lookZ, coreX,coreY,coreZ, coreScale, ringSpread, voxel, spin, tilt, glow, worldLight, relics, relicOrbit]
   relics/relicOrbit (new): how far the six science relics have assembled around the core, and their orbit radius. */
var POSES=[
  [0,.4,12, 0,0,0, 0,0,0, 1.25,1,0,.16,.5,1, 1, 0,3],
  [2.5,1.2,11, 0,0,0, 5.2,.2,-1, 1,1,0,.16,1,.85, 1, .85,2.7],
  [-2,3.5,13, 0,0,0, 0,-.5,-4, 1.6,1.9,0,.09,1.3,.38, .9, 0,3],
  [2,.5,10, 0,0,0, -5.4,0,-.5, 1.1,1,.25,.16,.4,.9, 1, 1,2.9],
  [0,-1,10, 0,-1.5,0, .5,4,-14, 1.7,1.1,1,.13,.6,.5, 1, 0,3],
  [0,.2,11, 0,0,0, 0,0,0, .13,.45,0,.06,.2,1.5, .2, 0,3],
  [0,2.5,12, 0,0,0, 0,0,-3, 1.3,1.6,0,.1,1.1,.32, .9, 0,3],
  [-1,-1,11, 0,-1.5,0, 0,1.8,-6, 1.1,1.3,.55,.13,.8,.4, 1, 0,3],
  [2,-1,11, 0,0,0, 6.4,2.4,-2, .8,1,0,.2,.9,.8, 1, 0,2.4],
  [0,.2,15, 0,0,0, 0,0,0, 1.5,2.2,0,.1,.3,.8, 1, 0,6],
  [0,.2,10, 0,0,0, 0,0,0, 1.9,1.25,0,.18,.15,1.4, 1, 1,7.4]
];
var POSE_TREE_B=[-.8,.6,11.5, -.4,0,0, -4.4,0,0, .03,.3,0,.05,.2,0, .38, 0,3];
var INTRO=POSES[0].slice(); INTRO[0]=15;INTRO[1]=9;INTRO[2]=46;INTRO[9]=.5;INTRO[10]=2.4;INTRO[14]=.3;INTRO[15]=.6;
var NP=18, live=INTRO.slice(), from=live.slice(), to=POSES[0].slice(), t0=0, dur=1, ez=easeIO;
function easeIO(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function easeOut(t){return 1-Math.pow(1-t,4)}
function setTarget(arr,d,e){from=live.slice();to=arr;t0=performance.now();dur=reduced?1:d*1000;ez=e||easeIO}
var ptx=0,pty=0,pmx=0,pmy=0;
window.addEventListener('pointermove',function(e){ptx=e.clientX/innerWidth*2-1;pty=e.clientY/innerHeight*2-1},{passive:true});


/* =========================================================
   3D WORLD: Three.js + postprocessing, with the original canvas-2D renderer as fallback
   ========================================================= */
var S={live:live,kk:1,pmx:0,pmy:0,dark:false};
var World=null, qs=location.search||'';
if(!/[?&]world=2d\b/.test(qs)){
  try{
    var tierQ=(qs.match(/[?&]quality=(low|high)\b/)||[])[1];
    World=createWorld3D($('#gl'),{reduced:reduced,tier:tierQ||detectTier(),adaptive:!/[?&]adaptive=0\b/.test(qs)});
    document.documentElement.classList.add('gl');
    if(World.tier==='low') document.documentElement.classList.add('lowfx');
  }catch(err){console.warn('WebGL world unavailable, using canvas fallback',err);World=null;
    var old=$('#gl'),cv=old.cloneNode(false);old.parentNode.replaceChild(cv,old);}
}
if(!World) World=createWorld2D($('#gl'));

/* one RAF loop: world + pointer parallax for the typography */
var lastPX=9,lastPY=9;
var fpsEl=null;
function loop(now){
  requestAnimationFrame(loop);
  pmx+=(ptx-pmx)*.05; pmy+=(pty-pmy)*.05;
  var kk=Math.min(1,Math.max(0,(now-t0)/dur)), k=ez(kk);
  for(var i=0;i<NP;i++) live[i]=from[i]+(to[i]-from[i])*k;
  S.kk=kk; S.pmx=pmx; S.pmy=pmy; S.dark=document.body.classList.contains('dark');
  if(!reduced&&(Math.abs(pmx-lastPX)>.003||Math.abs(pmy-lastPY)>.003)){
    lastPX=pmx;lastPY=pmy; stage.style.setProperty('--px',(-pmx).toFixed(3)); stage.style.setProperty('--py',(-pmy).toFixed(3));
  }
  try{World.step(now,S)}catch(err){if(!loop.warned){loop.warned=1;console.warn('3D world error',err)}}
  if(fpsEl&&now-(loop.lastF||0)>500){loop.lastF=now;var st=World.stats();fpsEl.textContent=st.fps+' FPS · '+st.dpr+'x · '+st.tier+(st.msaa?' · MSAA '+st.msaa:'')+(st.cpuMs!=null?' · CPU '+st.cpuMs.toFixed(1)+'ms':'')}
}
requestAnimationFrame(loop);

/* =========================================================
   GLOW SWEEP
   ========================================================= */
var sw=$('#sweep'), swTimer;
function sweepAt(y,dir,delay){
  if(reduced) return;
  clearTimeout(swTimer);
  swTimer=setTimeout(function(){
    sw.style.top=y+'px'; sw.classList.remove('go','rev'); void sw.offsetWidth;
    if(dir<0) sw.classList.add('rev'); sw.classList.add('go');
  },delay||0);
}

/* =========================================================
   NAVIGATION (slides + builds)
   ========================================================= */
var cur=-1, lockUntil=0, leaveTimers=[], phTimer, TREE=5;
function enterPhase2(){
  var s=slides[9]; if(cur!==9||s.classList.contains('phase2')) return;
  clearTimeout(phTimer); s.classList.add('phase2');
  setTarget(POSES[10],2.8); sweepAt(innerHeight/2,1,0);
  World.pulse('finale'); sfx.finale();
}
function treeBuild(on){
  var s=slides[TREE]; if(cur!==TREE) return;
  s.classList.add('built'); s.classList.toggle('b1',on);
  setTarget(on?POSE_TREE_B:POSES[TREE],2);
  if(on) scrambleIn($('.s6-panel'));
  sweepAt(innerHeight*.5,on?1:-1,40);
  World.pulse('build'); sfx.whoosh(on?1:-1,.6); sfx.treePanel(on);
}
function go(n,dir){
  if(n<0||n>=N||n===cur) return;
  var prev=cur; dir=dir||(n>prev?1:-1); cur=n;
  stage.classList.toggle('rev',dir<0);
  clearTimeout(phTimer);
  if(prev>=0){
    var ps=slides[prev]; ps.classList.remove('active'); ps.classList.add('leaving');
    clearTimeout(leaveTimers[prev]);
    leaveTimers[prev]=setTimeout(function(){ps.classList.remove('leaving','phase2','b1','built')},1150);
  }
  var s=slides[n]; clearTimeout(leaveTimers[n]);
  s.classList.remove('leaving','phase2','b1','built');
  /* prime the entering slide so it always arrives from depth */
  s.style.transition='none'; s.style.transform='scale('+(dir>0?.9:1.1)+')'; s.style.opacity='0'; void s.offsetWidth;
  s.style.transition=''; s.style.transform=''; s.style.opacity='';
  var treeB=(n===TREE&&dir<0&&prev>=0);
  if(treeB) s.classList.add('b1','built');
  s.classList.add('active');
  document.body.classList.toggle('dark',n===TREE);
  sfx.cancelSeq(); sfx.droneMood(n===TREE);
  if(prev>=0){World.pulse('slide'); sfx.whoosh(dir,1)}
  if(n===TREE&&!treeB) sfx.tree();
  hud(n);
  scrambleIn(s,n===TREE&&!treeB);
  var rule=s.querySelector('.rule'), y=innerHeight*.5;
  if(rule){var rc=rule.getBoundingClientRect(); if(rc.height) y=rc.top+rc.height/2}
  if(prev<0){setTarget(POSES[0],3.8,easeOut); sweepAt(y,1,1900)}
  else{setTarget(treeB?POSE_TREE_B:POSES[n],2.3); sweepAt(y,dir,60)}
  if(n===9) phTimer=setTimeout(enterPhase2,12000);
}
function next(){
  var now=performance.now(); if(now<lockUntil) return; lockUntil=now+600;
  if(cur===TREE&&!slides[TREE].classList.contains('b1')){treeBuild(true);return}
  if(cur===9){enterPhase2();return}
  go(cur+1,1);
}
function prevSlide(){
  var now=performance.now(); if(now<lockUntil) return; lockUntil=now+600;
  if(cur===TREE&&slides[TREE].classList.contains('b1')){treeBuild(false);return}
  go(cur-1,-1);
}
function fullscreen(){
  var d=document;
  if(d.fullscreenElement){d.exitFullscreen&&d.exitFullscreen();return}
  var el=d.documentElement; if(el.requestFullscreen){var pr=el.requestFullscreen(); if(pr&&pr.catch) pr.catch(function(){})}
}
document.addEventListener('keydown',function(e){
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  var k=e.key;
  if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();next()}
  else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'||k==='Backspace'){e.preventDefault();prevSlide()}
  else if(k==='Home'){e.preventDefault();lockUntil=0;go(0,-1)}
  else if(k==='End'){e.preventDefault();lockUntil=0;go(N-1,1)}
  else if(k==='f'||k==='F'){fullscreen()}
  else if(k==='m'||k==='M'){sfx.toggle()}
  else if(k==='p'||k==='P'){toggleFps()}
});
function toggleFps(){
  if(fpsEl){fpsEl.remove();fpsEl=null;return}
  fpsEl=document.createElement('div');fpsEl.id='fps';fpsEl.setAttribute('aria-hidden','true');document.body.appendChild(fpsEl);
}
if(/[?&]fps\b/.test(qs)) toggleFps();
var snd=$('#snd');
snd.addEventListener('click',function(e){e.stopPropagation();sfx.unlock();sfx.toggle();sfx.click()});
sfx.onChange(function(m){snd.setAttribute('aria-pressed',String(!m));snd.setAttribute('aria-label',m?'Turn sound on':'Turn sound off');snd.classList.toggle('off',m)});
function unlockAudio(){sfx.unlock()}
['pointerdown','keydown','touchend'].forEach(function(ev){document.addEventListener(ev,unlockAudio,{passive:true,capture:true})});
$('#next').addEventListener('click',function(e){e.stopPropagation();next()});
$('#prev').addEventListener('click',function(e){e.stopPropagation();prevSlide()});
$('#fs').addEventListener('click',function(e){e.stopPropagation();fullscreen()});
if(!document.fullscreenEnabled) $('#fs').hidden=true;
stage.addEventListener('click',function(e){
  if(e.target.closest&&e.target.closest('button')) return;
  if(e.clientX<innerWidth*.28) prevSlide(); else next();
});
var sx=null;
document.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',function(e){
  if(sx===null) return; var dx=e.changedTouches[0].clientX-sx; sx=null;
  if(Math.abs(dx)>60){dx<0?next():prevSlide()}
},{passive:true});
window.addEventListener('resize',function(){fit();World.resize()});

fit();
var started=false;
function start(){if(started) return; started=true; fit(); $('#intro').classList.add('go'); go(0,1); World.pulse('intro'); sfx.intro()}
/* compile all shaders while the black intro covers the screen, so the reveal never hitches */
if(World.warmup){try{World.warmup(S)}catch(err){console.warn('warm-up failed',err)}}
if(document.fonts&&document.fonts.ready){
  Promise.race([document.fonts.ready,new Promise(function(r){setTimeout(r,1200)})]).then(start);
}else{setTimeout(start,300)}
setTimeout(start,1800);
window.__deck={go:go,next:next,prev:prevSlide,state:function(){return{cur:cur,b1:slides[TREE].classList.contains('b1'),phase2:slides[9].classList.contains('phase2')}},stats:function(){return World.stats()},sound:sfx};
}
