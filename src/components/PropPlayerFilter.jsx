import React,{useEffect,useId,useRef,useState} from 'react';

export default function PropPlayerFilter({choices,value,query,onQuery,onSelect}){
  const id=useId(), input=useRef(null);
  const [open,setOpen]=useState(false);
  const [cursor,setCursor]=useState(0);
  const options=[{id:'',name:'All Players'},...choices];
  const selected=Math.max(0,options.findIndex(p=>p.id===value));
  const active=Math.min(cursor,options.length-1);
  useEffect(()=>{
    if(open)document.getElementById(id+'-option-'+active)?.scrollIntoView({block:'nearest'});
  },[open,active,id]);
  function choose(index){
    onSelect(options[index].id);
    setOpen(false);
  }
  function browse(){setOpen(true);setCursor(selected)}
  function keyDown(e){
    if(e.key==='Escape'){setOpen(false);return}
    if(e.key==='Enter' && open){e.preventDefault();choose(active);return}
    if(e.key!=='ArrowDown' && e.key!=='ArrowUp')return;
    e.preventDefault();setOpen(true);
    setCursor(Math.max(0,Math.min(options.length-1,(open?active:selected)+(e.key==='ArrowDown'?1:-1))));
  }
  return <div className="chart-filter prop-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}>
    <label htmlFor={id}>Player</label>
    <div className="chart-select-row">
      <div className="prop-picker-input"><input id={id} ref={input} type="search" autoComplete="off" role="combobox"
        aria-expanded={open} aria-controls={id+'-list'} aria-autocomplete="list"
        aria-activedescendant={open?id+'-option-'+active:undefined}
        placeholder={open?'Search Players…':'All Players'} value={query || (!open && value?options[selected].name:'')}
        onFocus={browse} onClick={()=>{if(!open)browse()}} onKeyDown={keyDown}
        onChange={e=>{onQuery(e.target.value);setOpen(true);setCursor(e.target.value?1:0)}}/>
        <button aria-label={open?'Close player list':'Browse players'} type="button" onMouseDown={e=>e.preventDefault()}
          onClick={()=>{if(open)setOpen(false);else{input.current.focus();browse()}}}><i aria-hidden="true"/></button>
      </div>
      <div className="chart-step-buttons">{[-1,1].map(step=><button type="button" key={step} disabled={!options[selected+step]}
        aria-label={step<0?'Previous player':'Next player'} onClick={()=>choose(selected+step)}>
        <span className={step<0?'chart-step-up':'chart-step-down'} aria-hidden="true"/></button>)}</div>
    </div>
    {open && <div className="prop-picker-menu"><div id={id+'-list'} role="listbox" aria-label="Players">
      {options.map((p,i)=><div key={p.id} role="option" id={id+'-option-'+i} aria-selected={p.id===value}
        data-active={i===active} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(i)}>
        {p.name}{p.team && <small>{p.team}</small>}</div>)}
    </div>{!choices.length && <small>No Matching Players</small>}</div>}
  </div>;
}
