import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronDown} from 'lucide-react';
import './FilterMenu.css';

export default function FilterMenu({children, value, onChange, disabled, ...props}) {
  const options = React.Children.toArray(children).filter(React.isValidElement).map(({props:option})=>{
    const label = React.Children.toArray(option.children).join('');
    return {label, value:String(option.value ?? label)};
  });
  const selected = options.findIndex(option=>option.value===String(value));
  const [open,setOpen] = useState(false);
  const [active,setActive] = useState(0);
  const [position,setPosition] = useState(null);
  const button = useRef(null), menu = useRef(null), search = useRef({text:'',time:0});
  const id = useId();

  function show() {setActive(Math.max(0,selected));setOpen(true);}
  function choose(index) {
    if (!options[index]) return;
    onChange({target:{value:options[index].value}});
    setOpen(false);
    button.current?.focus({preventScroll:true});
  }
  useLayoutEffect(()=>{
    if (!open) return;
    function place() {
      const box = button.current.getBoundingClientRect();
      const width = Math.min(Math.max(box.width,220),window.innerWidth-24);
      const below = window.innerHeight-box.bottom-16, above = box.top-16;
      const flip = below<Math.min(options.length*44+12,264) && above>below;
      const left = Math.max(12,Math.min(box.left+(box.width-width)/2,window.innerWidth-width-12));
      setPosition({width,left,maxHeight:Math.min(320,Math.max(44,flip?above:below)),
        ...(flip?{bottom:window.innerHeight-box.top+5}:{top:box.bottom+5})});
    }
    place();
    function outside(e) {
      if(!button.current?.contains(e.target) && !menu.current?.contains(e.target))setOpen(false);
    }
    window.addEventListener('resize',place);
    window.addEventListener('scroll',place,true);
    document.addEventListener('pointerdown',outside);
    return ()=>{
      window.removeEventListener('resize',place);
      window.removeEventListener('scroll',place,true);
      document.removeEventListener('pointerdown',outside);
    };
  },[open,options.length]);
  useEffect(()=>{
    if(open && position) {
      const list=menu.current, item=list?.children[active];
      if(!item)return;
      if(item.offsetTop<list.scrollTop)list.scrollTop=item.offsetTop;
      else if(item.offsetTop+item.offsetHeight>list.scrollTop+list.clientHeight)
        list.scrollTop=item.offsetTop+item.offsetHeight-list.clientHeight;
    }
  },[open,active,Boolean(position)]);
  function keyDown(e) {
    if(e.key==='Tab'){setOpen(false);return;}
    if(e.key==='Escape'){setOpen(false);e.preventDefault();return;}
    if(['Enter',' '].includes(e.key)){e.preventDefault();open?choose(active):show();return;}
    if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();
      if(!open){show();return;}
      setActive(i=>e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowUp'?-1:1))));
      return;
    }
    if(e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
      const now=Date.now();
      const text=(now-search.current.time<750?search.current.text:'')+e.key.toLowerCase();
      search.current={text,time:now};
      const index=options.findIndex(o=>o.label.toLowerCase().startsWith(text));
      if(index>=0){setActive(index);setOpen(true);}
    }
  }
  const expanded=open && !disabled && options.length>0;
  return <>
    <button {...props} ref={button} className="filter-trigger" type="button" role="combobox"
      disabled={disabled || !options.length} aria-haspopup="listbox" aria-expanded={Boolean(expanded)}
      aria-controls={expanded?id:undefined} aria-activedescendant={expanded?id+'-'+active:undefined}
      onClick={()=>open?setOpen(false):show()} onKeyDown={keyDown}>
      <span>{options[selected]?.label || options[0]?.label || '—'}</span><ChevronDown size={15} aria-hidden="true"/>
    </button>
    {expanded && position && createPortal(<div ref={menu} className="filter-popup" role="listbox"
      id={id} aria-label={props['aria-label'] || button.current?.labels?.[0]?.firstChild?.textContent || 'Options'} style={position}>
      {options.map((option,i)=><div role="option" aria-selected={selected===i} id={id+'-'+i} key={option.value}
        className={active===i?'active':''} onPointerMove={()=>setActive(i)} onMouseDown={e=>e.preventDefault()}
        onClick={e=>{e.preventDefault();e.stopPropagation();choose(i);}}>
        <span>{option.label}</span>{selected===i && <Check size={15} aria-hidden="true"/>}
      </div>)}
    </div>,button.current.closest('.app') || document.body)}
  </>;
}
