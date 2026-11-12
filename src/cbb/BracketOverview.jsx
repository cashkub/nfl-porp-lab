import React,{useLayoutEffect,useRef,useState} from 'react';
import {Maximize,Minus,Plus} from 'lucide-react';

const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const middle=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

export default function BracketOverview({children}){
  const frame=useRef(null),sheet=useRef(null),points=useRef(new Map()),tap=useRef(null);
  const [size,setSize]=useState(null);
  const [camera,setCamera]=useState({zoom:1,x:0,y:0});
  useLayoutEffect(()=>{
    function measure(){
      const f=frame.current,s=sheet.current;
      setSize({w:f.clientWidth,h:f.clientHeight,sw:s.offsetWidth,sh:s.offsetHeight});
      setCamera({zoom:1,x:0,y:0});
    }
    const ro=new ResizeObserver(measure);
    ro.observe(frame.current);ro.observe(sheet.current);measure();
    return ()=>ro.disconnect();
  },[]);
  const fit=size?Math.min(size.w/size.sw,size.h/size.sh):1;
  const maxZoom=Math.max(4,2/fit);
  function bounds(position,extent,available){
    return extent<=available?(available-extent)/2:clamp(position,available-extent,0);
  }
  function origin(c){
    return {x:bounds(c.x,size.sw*fit*c.zoom,size.w),y:bounds(c.y,size.sh*fit*c.zoom,size.h)};
  }
  function move(factor,from,to=from){
    if(!size)return;
    setCamera(c=>{
      const zoom=clamp(c.zoom*factor,1,maxZoom),ratio=zoom/c.zoom,old=origin(c);
      const next={zoom,x:to.x-(from.x-old.x)*ratio,y:to.y-(from.y-old.y)*ratio};
      return {...next,...origin(next)};
    });
  }
  function centerZoom(factor){
    if(size)move(factor,{x:size.w/2,y:size.h/2});
  }
  function local(e){
    const r=frame.current.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  }
  function down(e){
    if(e.button!==0||!size)return;
    const p=local(e);
    frame.current.setPointerCapture(e.pointerId);
    points.current.set(e.pointerId,p);
    tap.current=points.current.size===1?p:null;
  }
  function drag(e){
    const active=points.current;
    if(!active.has(e.pointerId))return;
    const before=[...active.values()],p=local(e);
    active.set(e.pointerId,p);
    const after=[...active.values()];
    if(tap.current&&distance(tap.current,p)>5)tap.current=null;
    if(after.length===1)move(1,before[0],p);
    if(after.length===2){
      const span=distance(...before);
      if(span>0)move(distance(...after)/span,middle(...before),middle(...after));
    }
  }
  function end(e){
    if(tap.current&&points.current.has(e.pointerId)&&e.type==='pointerup'&&distance(tap.current,local(e))<=5){
      move(camera.zoom===1?Math.max(2,1/fit):1.5,local(e));
    }
    tap.current=null;
    points.current.delete(e.pointerId);
  }
  function key(e){
    const offsets={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};
    if(offsets[e.key]){
      const [x,y]=offsets[e.key];move(1,{x:0,y:0},{x,y});
    }else if(e.key==='+'||e.key==='=')centerZoom(1.5);
    else if(e.key==='-')centerZoom(1/1.5);
    else if(e.key==='Home')setCamera({zoom:1,x:0,y:0});
    else return;
    e.preventDefault();
  }
  const pos=size?origin(camera):{x:0,y:0};
  return <section className="br-overview" aria-label="All regional brackets">
    <div className="br-zoom-controls">
      <button aria-label="Zoom out" disabled={camera.zoom<=1} onClick={()=>centerZoom(1/1.5)}><Minus size={18}/></button>
      <button onClick={()=>setCamera({zoom:1,x:0,y:0})}><Maximize size={16}/> Fit all</button>
      <button aria-label="Zoom in" disabled={camera.zoom>=maxZoom} onClick={()=>centerZoom(1.5)}><Plus size={18}/></button>
    </div>
    <p id="br-zoom-help">Tap a matchup to zoom. Drag to move or pinch to change scale.</p>
    <div className="br-viewport" ref={frame} tabIndex={0} role="region" aria-label="Zoomable bracket" aria-describedby="br-zoom-help"
      onKeyDown={key} onPointerDown={down} onPointerMove={drag} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div ref={sheet} className="br-sheet" style={{visibility:size?'visible':'hidden',transform:'translate('+pos.x+'px,'+pos.y+'px) scale('+fit*camera.zoom+')'}}>{children}</div>
    </div>
  </section>;
}
