/* Original dependency-free perspective renderer on canvas 2D.
   Kept unchanged as the fallback for devices without WebGL. Pose interpolation now
   happens in the deck loop; this renderer reads the shared state S each frame. */
export function createWorld2D(cv){
  var ctx=null;
  try{ctx=cv.getContext('2d',{alpha:true})}catch(e){}
  if(!ctx){cv.style.display='none';return{resize:function(){},step:function(){},pulse:function(){},stats:function(){return{fps:0,dpr:0,tier:'none'}},isGL:false}}
  var W=1,H=1,DPR=1,F=1;
  function resize(){
    DPR=Math.min(window.devicePixelRatio||1,1.5); W=innerWidth; H=innerHeight;
    cv.width=Math.max(1,Math.round(W*DPR)); cv.height=Math.max(1,Math.round(H*DPR));
    var a=W/H, fov=a<16/9?2*Math.atan(Math.tan(25*Math.PI/180)*(16/9)/a):50*Math.PI/180;
    F=(H/2)/Math.tan(fov/2);
  }
  function sprite(r,g,b){
    var c=document.createElement('canvas');c.width=c.height=64;var x=c.getContext('2d'),gr=x.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.18,'rgba('+r+','+g+','+b+',.9)');gr.addColorStop(.45,'rgba('+r+','+g+','+b+',.25)');gr.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
    x.fillStyle=gr;x.fillRect(0,0,64,64);return c;
  }
  var SP=[sprite(212,241,255),sprite(34,230,255),sprite(143,116,255)], WHITE=sprite(230,250,255);
  /* particles */
  var PC=1800, P=new Float32Array(PC*3), PCo=new Uint8Array(PC), PB=new Float32Array(PC), PT=new Float32Array(PC);
  for(var i=0;i<PC;i++){
    P[i*3]=(Math.random()-.5)*90; P[i*3+1]=(Math.random()-.5)*50; P[i*3+2]=-60+Math.random()*85;
    var r=Math.random(); PCo[i]=r<.6?0:(r<.9?1:2); PB[i]=.35+Math.random()*.65; PT[i]=Math.random()*6.283;
  }
  /* camera */
  var C={x:0,y:0,z:12,rx:1,ry:0,rz:0,ux:0,uy:1,uz:0,fx:0,fy:0,fz:-1};
  function look(px,py,pz,tx,ty,tz){
    var fx=tx-px,fy=ty-py,fz=tz-pz,l=Math.sqrt(fx*fx+fy*fy+fz*fz)||1; fx/=l;fy/=l;fz/=l;
    var rx=-fz,rz=fx,rl=Math.sqrt(rx*rx+rz*rz)||1; rx/=rl; rz/=rl;
    C.x=px;C.y=py;C.z=pz;C.fx=fx;C.fy=fy;C.fz=fz;C.rx=rx;C.ry=0;C.rz=rz;
    C.ux=-rz*fy; C.uy=rz*fx-rx*fz; C.uz=rx*fy;
  }
  var Q={x:0,y:0,z:0};
  function proj(x,y,z){
    var dx=x-C.x,dy=y-C.y,dz=z-C.z, cz=dx*C.fx+dy*C.fy+dz*C.fz; if(cz<.15) return false;
    Q.x=W/2+(dx*C.rx+dy*C.ry+dz*C.rz)/cz*F; Q.y=H/2-(dx*C.ux+dy*C.uy+dz*C.uz)/cz*F; Q.z=cz; return true;
  }
  function fog(z){var k=.026*z;return Math.exp(-k*k)}
  /* rotation matrix, three.js 'XYZ' Euler order (row-major) */
  function mat(x,y,z){
    var a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z),ae=a*e,af=a*f,be=b*e,bf=b*f;
    return [c*e,-c*f,d, af+be*d,ae-bf*d,-b*c, bf-ae*d,be+af*d,a*c];
  }
  function mul(A,B){var o=new Array(9);for(var r=0;r<3;r++)for(var c=0;c<3;c++)o[r*3+c]=A[r*3]*B[c]+A[r*3+1]*B[3+c]+A[r*3+2]*B[6+c];return o}
  /* gyro-core */
  var RAD=[2.35,1.8,1.3], RCOL=['#22e6ff','#d4f1ff','#8f74ff'], RSP=[SP[1],SP[0],SP[2]], BASEE=[[1.1,.2,0],[.4,1,.3],[.2,-.6,1]], ph=[0,2,4], spinAcc=0, crx=0, cry=0;
  var IV=[],IE=[],gt=(1+Math.sqrt(5))/2;
  [[-1,gt,0],[1,gt,0],[-1,-gt,0],[1,-gt,0],[0,-1,gt],[0,1,gt],[0,-1,-gt],[0,1,-gt],[gt,0,-1],[gt,0,1],[-gt,0,-1],[-gt,0,1]].forEach(function(v){var l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);IV.push([v[0]/l*.62,v[1]/l*.62,v[2]/l*.62])});
  for(var a1=0;a1<12;a1++)for(var a2=a1+1;a2<12;a2++){var dd=Math.hypot(IV[a1][0]-IV[a2][0],IV[a1][1]-IV[a2][1],IV[a1][2]-IV[a2][2]);if(dd<.7)IE.push([a1,a2])}
  /* voxel terrain */
  var COLS=60,CS=.5,cells=[];
  for(var ci=0;ci<COLS;ci++){
    var hh=Math.round(2.4+1.6*Math.sin(ci*.31)+1.1*Math.sin(ci*.12+1.7)+.9*Math.sin(ci*.77+.4)); hh=Math.max(1,Math.min(5,hh));
    for(var j=0;j<hh;j++){
      var top=j===hh-1, col, m;
      if(top){var vi=Math.random()<.12; m=.75+Math.random()*.25; col=vi?[143,116,255]:[34,230,255];}
      else{var l2=Math.random()*.7; m=.7+j/hh*.3; col=[11+(20-11)*l2,47+(80-47)*l2,122+(158-122)*l2];}
      var fr='rgb('+Math.round(col[0]*m)+','+Math.round(col[1]*m)+','+Math.round(col[2]*m)+')';
      var tp='rgb('+Math.min(255,Math.round(col[0]*m*1.35+20))+','+Math.min(255,Math.round(col[1]*m*1.35+20))+','+Math.min(255,Math.round(col[2]*m*1.35+20))+')';
      cells.push({x:(ci-COLS/2)*CS,y:j*CS,c:ci,j:j,top:top,f:fr,t:tp});
    }
  }
  /* grid segment buckets */
  var NB=7, BK=[]; for(var b=0;b<NB;b++) BK.push([]);
  var A3=[0,0,0],B3=[0,0,0];
  function camv(x,y,z,o){var dx=x-C.x,dy=y-C.y,dz=z-C.z;o[0]=dx*C.rx+dy*C.ry+dz*C.rz;o[1]=dx*C.ux+dy*C.uy+dz*C.uz;o[2]=dx*C.fx+dy*C.fy+dz*C.fz}
  function seg(x1,y1,z1,x2,y2,z2,amp){
    camv(x1,y1,z1,A3);camv(x2,y2,z2,B3);var n=.2;
    if(A3[2]<n&&B3[2]<n) return;
    if(A3[2]<n){var t=(n-A3[2])/(B3[2]-A3[2]);A3[0]+=(B3[0]-A3[0])*t;A3[1]+=(B3[1]-A3[1])*t;A3[2]=n}
    else if(B3[2]<n){var t2=(n-B3[2])/(A3[2]-B3[2]);B3[0]+=(A3[0]-B3[0])*t2;B3[1]+=(A3[1]-B3[1])*t2;B3[2]=n}
    var a=amp*fog((A3[2]+B3[2])/2); if(a<.01) return;
    var k=Math.min(NB-1,(a*NB)|0);
    BK[k].push(W/2+A3[0]/A3[2]*F,H/2-A3[1]/A3[2]*F,W/2+B3[0]/B3[2]*F,H/2-B3[1]/B3[2]*F);
  }
  var last=performance.now(), pr=0;
  function step(now,S){
    var dt=Math.min(.05,(now-last)/1000); last=now; var t=now/1000, i;
    var kk=S.kk, pmx=S.pmx, pmy=S.pmy;
    var L=S.live, ox=L[6],oy=L[7],oz=L[8],os=L[9],sp=L[10],v=L[11],s=L[12],ti=L[13],g=L[14],dim=L[15];
    look(L[0]+pmx*.6+Math.sin(t*.21)*.3, L[1]-pmy*.35+Math.cos(t*.17)*.18, L[2], L[3],L[4],L[5]);
    ctx.setTransform(DPR,0,0,DPR,0,0); ctx.clearRect(0,0,W,H);

    /* particles */
    ctx.globalCompositeOperation='lighter';
    pr+=dt*(.008+.08*Math.sin(Math.PI*kk));
    var ca=Math.cos(pr),sa=Math.sin(pr),hh=H/2;
    for(i=0;i<PC;i++){
      var x=P[i*3],y=P[i*3+1],z=P[i*3+2],rx=x*ca+z*sa,rz=-x*sa+z*ca;
      if(!proj(rx,y,rz)) continue;
      if(Q.x<-20||Q.x>W+20||Q.y<-20||Q.y>H+20) continue;
      var sz=Math.max(.7,.09*hh/Q.z*2.6), al=PB[i]*fog(Q.z)*dim*.9*(.72+.28*Math.sin(t*1.3+PT[i]));
      if(al<.015) continue;
      ctx.globalAlpha=Math.min(1,al); ctx.drawImage(SP[PCo[i]],Q.x-sz,Q.y-sz,sz*2,sz*2);
    }

    /* floor grid (quantised alpha buckets for speed) */
    for(var b=0;b<NB;b++) BK[b].length=0;
    var gy=-5.4, gz=(t*.35)%2, amp=(.32+.16*(1-Math.min(1,v)))*dim;
    for(var gx=-60;gx<=60;gx+=2) for(var zz=-80;zz<30;zz+=11) seg(gx,gy,zz,gx,gy,zz+11,amp);
    for(var zl=-80;zl<=30;zl+=2) for(var xx=-60;xx<60;xx+=24) seg(xx,gy,zl+gz,xx+24,gy,zl+gz,amp);
    ctx.strokeStyle='rgb(46,130,235)'; ctx.lineWidth=1;
    for(b=0;b<NB;b++){
      var arr=BK[b]; if(!arr.length) continue;
      ctx.globalAlpha=(b+.5)/NB; ctx.beginPath();
      for(var q=0;q<arr.length;q+=4){ctx.moveTo(arr[q],arr[q+1]);ctx.lineTo(arr[q+2],arr[q+3])}
      ctx.stroke();
    }

    /* voxel terrain */
    if(v>.002){
      ctx.globalCompositeOperation='source-over';
      var vx=Math.sin(t*.1)*.5, vy=-6.5, vz=-1;
      for(var c=0;c<cells.length;c++){
        var cl=cells[c], u=(v*1.7-(cl.c/COLS)*.95-cl.j*.03)/.45; u=Math.max(0,Math.min(1,u)); u=u*u*(3-2*u);
        if(u<.02) continue;
        var hs=CS*.44*u, cxw=vx+cl.x, cyw=vy+cl.y, zf=vz+hs;
        if(!proj(cxw-hs,cyw+hs,zf)) continue; var x1=Q.x,y1=Q.y,fz=Q.z;
        if(!proj(cxw+hs,cyw-hs,zf)) continue; var x2=Q.x,y2=Q.y;
        var fa=fog(fz)*dim; if(fa<.02) continue;
        ctx.globalAlpha=fa;
        if(cl.top&&proj(cxw-hs,cyw+hs,zf-2*hs)){
          var bx1=Q.x,by1=Q.y; proj(cxw+hs,cyw+hs,zf-2*hs);
          ctx.fillStyle=cl.t; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y1); ctx.lineTo(Q.x,Q.y); ctx.lineTo(bx1,by1); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle=cl.f; ctx.fillRect(x1,y1,x2-x1,y2-y1);
        if(cl.top){ctx.globalAlpha=fa*.5;ctx.strokeStyle='rgba(212,241,255,.7)';ctx.lineWidth=1;ctx.strokeRect(x1+.5,y1+.5,x2-x1-1,y2-y1-1)}
      }
    }

    /* gyro-core (rings precess slowly; no fast spin) */
    ctx.globalCompositeOperation='lighter';
    spinAcc+=dt*s; crx+=dt*.2; cry+=dt*.35;
    var G=mat(ti*.4,Math.sin(t*.1)*.4,0), gl=Math.min(1.4,g);
    for(var rr=0;rr<3;rr++){
      var sc=RAD[rr]*(1+(sp-1)*(.55+.2*rr));
      var M=mul(G,mat(BASEE[rr][0]+spinAcc*(.5+.3*rr),BASEE[rr][1]+spinAcc*(.35+.25*rr),BASEE[rr][2]));
      var ra=(.16+.62*gl)*.85; if(ra<.01) continue;
      ctx.beginPath(); var started=false;
      for(var sgi=0;sgi<=96;sgi++){
        var an=sgi/96*6.2832, lx=Math.cos(an)*sc, ly=Math.sin(an)*sc;
        var wx=(M[0]*lx+M[1]*ly)*os+ox, wy=(M[3]*lx+M[4]*ly)*os+oy, wz=(M[6]*lx+M[7]*ly)*os+oz;
        if(proj(wx,wy,wz)){if(started)ctx.lineTo(Q.x,Q.y);else{ctx.moveTo(Q.x,Q.y);started=true}}else started=false;
      }
      ctx.strokeStyle=RCOL[rr];
      ctx.globalAlpha=ra*.22; ctx.lineWidth=5; ctx.stroke();
      ctx.globalAlpha=ra; ctx.lineWidth=1.2; ctx.stroke();
      ph[rr]+=dt*(1.2+.8*rr)*(.6+s*3);
      var ex=Math.cos(ph[rr])*sc, ey=Math.sin(ph[rr])*sc;
      if(proj((M[0]*ex+M[1]*ey)*os+ox,(M[3]*ex+M[4]*ey)*os+oy,(M[6]*ex+M[7]*ey)*os+oz)){
        var es=Math.max(2,.55*sc*os*F/Q.z); ctx.globalAlpha=Math.min(1,.4+.5*gl); ctx.drawImage(RSP[rr],Q.x-es/2,Q.y-es/2,es,es);
      }
    }
    var CM=mul(G,mat(crx,cry,0)), PV=[];
    for(var vi2=0;vi2<12;vi2++){
      var vv=IV[vi2], wx2=(CM[0]*vv[0]+CM[1]*vv[1]+CM[2]*vv[2])*os+ox, wy2=(CM[3]*vv[0]+CM[4]*vv[1]+CM[5]*vv[2])*os+oy, wz2=(CM[6]*vv[0]+CM[7]*vv[1]+CM[8]*vv[2])*os+oz;
      PV.push(proj(wx2,wy2,wz2)?[Q.x,Q.y]:null);
    }
    ctx.strokeStyle='#22e6ff'; ctx.lineWidth=1; ctx.globalAlpha=(.45+.4*Math.min(1,g))*Math.min(1,os*3); ctx.beginPath();
    IE.forEach(function(e){var p1=PV[e[0]],p2=PV[e[1]];if(p1&&p2){ctx.moveTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1])}}); ctx.stroke();
    if(proj(ox,oy,oz)){
      var pxs=F/Q.z, inr=.34*os*3.2*pxs*(1+.08*Math.sin(t*2.2)), hal=4.6*os*pxs;
      ctx.globalAlpha=Math.min(1,.08+.24*gl); ctx.drawImage(SP[1],Q.x-hal/2,Q.y-hal/2,hal,hal);
      ctx.globalAlpha=Math.min(1,.5+.4*gl); ctx.drawImage(WHITE,Q.x-inr/2,Q.y-inr/2,inr,inr);
    }
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  }
  resize();
  return{resize:resize,step:step,pulse:function(){},stats:function(){return{fps:0,dpr:DPR,tier:'2d'}},isGL:false};
}
