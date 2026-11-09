import React,{useState} from 'react';

const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
export default function SortableTable({headers,rows,values,renderRow,limit,sort,onSort,descending=[],caption,quietSort=false,className='game-log'}){
  const [local,setLocal]=useState(null);
  const active=sort || local;
  const column=active?.column;
  function change(i){
    const next={column:i,asc:column===i?!active.asc:!descending.includes(i)};
    (onSort || setLocal)(next);
  }
  let ordered=rows;
  if(column!=null && column<headers.length){
    ordered=rows.map(row=>({row,value:values(row)[column]})).sort((a,b)=>{
      const x=a.value,y=b.value;
      if(x==null || y==null)return Number(x==null)-Number(y==null);
      const diff=typeof x==='number' && typeof y==='number'?x-y:collator.compare(x,y);
      return active.asc?diff:-diff;
    }).map(entry=>entry.row);
  }
  return <table className={className}>{caption && <caption>{caption}</caption>}<thead><tr>{headers.map((h,i)=><th scope="col" key={i} aria-sort={column===i?(active.asc?'ascending':'descending'):undefined}><button className="column-sort" type="button" onClick={()=>change(i)}>{h}{quietSort ? column===i && <span aria-hidden="true" className="sort-chevron"/> : <span aria-hidden="true"> {column===i?(active.asc?'↑':'↓'):'↕'}</span>}</button></th>)}</tr></thead>
    <tbody>{(limit==null?ordered:ordered.slice(0,limit)).map(renderRow)}</tbody></table>;
}
