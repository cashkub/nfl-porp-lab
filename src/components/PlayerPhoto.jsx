import React,{useState} from 'react';
export default function PlayerPhoto({id,name,url,large=false}){
  const src=url;
  const [failed,setFailed]=useState(null);
  const initials=(name || '').trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('');
  return <span aria-hidden="true" className={'player-photo'+(large?' player-photo-large':'')}>
    {src && src!==failed?<img src={src} alt="" loading={large?'eager':'lazy'} decoding="async" onError={()=>setFailed(src)}/>:initials}
  </span>;
}
