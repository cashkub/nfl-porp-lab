import React from 'react';
import './PregameForm.css';

export default function PregameForm({values,line,side,touchdown,label}){
  const samples=Array.isArray(values)?values.slice(-5):[];
  if(!samples.length)return <span className="record-no-sample">No pregame sample saved</span>;
  const max=Math.max(1,...samples);
  return <span className="record-form" role="group" aria-label="Previous games, oldest to newest">
    {samples.map((value,index)=>{
      const push=!touchdown&&value===line;
      const hit=touchdown?value>0:side==='under'?value<line:value>line;
      const result=push?'push':hit?'hit':'miss';
      const detail=value+' '+(label||'stat')+' · '+result;
      return <span className={'record-form-game '+(push?'form-push':hit?'form-good':'form-bad')} key={index} role="img" aria-label={detail} title={detail}>
        <i style={{height:Math.max(8,value/max*100)+'%'}}/><b>{value}</b>
      </span>;
    })}
  </span>;
}
