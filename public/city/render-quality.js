/* Shared city rendering policy. No geometry or workspace data is discarded. */
(function (root) {
 'use strict';
 function profile(width, coarse) {
  if (width <= 700) return {name:'phone', cap:1.5, pixels:2800000};
  if (width <= 1100) return {name:'tablet', cap:1.75, pixels:4000000};
  return {name:'desktop', cap:2, pixels:6000000};
 }
 function create(width, coarse, deviceDpr, saveData) {
  var p=profile(width,coarse), max=Math.min(deviceDpr||1,p.cap,saveData?1.25:Infinity);
  var state={profile:p, dpr:max, max:max, min:Math.min(1,max), total:0, count:0, healthy:0};
  state.sample=function(fps) {
   if (!Number.isFinite(fps)||fps<=0) return false;
   state.total+=fps;state.count++;
   if(state.count<6)return false;
   var avg=state.total/state.count;state.total=0;state.count=0;
   var old=state.dpr;
   if(avg<45){state.healthy=0;state.dpr=Math.max(state.min,state.dpr-0.125);}
   else if(avg>57){state.healthy++;if(state.healthy>=2){state.dpr=Math.min(state.max,state.dpr+0.125);state.healthy=0;}}
   else state.healthy=0;
   return old!==state.dpr;
  };
  state.reset=function(){state.total=0;state.count=0;state.healthy=0;};
  state.pixelRatio=function(w,h){return Math.min(state.dpr,Math.sqrt(p.pixels/Math.max(1,w*h)));};
  return state;
 }
 function frameGate() {
  var last=null;
  return {
   reset:function(){last=null;},
   take:function(now,fps){
    var interval=1000/fps;
    if(last===null){last=now;return true;}
    var elapsed=now-last;
    if(elapsed<interval-0.4)return false;
    last=elapsed<interval?now:now-(elapsed%interval);
    return true;
   }
  };
 }
 function radius(width,height) {return Math.min(680,340/Math.min(1,Math.max(.5,width/Math.max(1,height)*1.2)));}
 root.AutivaRenderQuality={profile:profile,create:create,radius:radius,frameGate:frameGate};
})(typeof window!=='undefined'?window:globalThis);
