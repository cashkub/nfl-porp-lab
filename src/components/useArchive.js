import {useEffect,useState} from 'react';

export function useArchive(file){
  const [state,setState]=useState({});
  useEffect(()=>{
    if(!file)return;
    const ctrl=new AbortController();
    fetch(import.meta.env.BASE_URL+'data/'+file,{signal:ctrl.signal,cache:'no-cache'})
      .then(r=>{if(!r.ok)throw Error();return r.json()})
      .then(rows=>setState({file,rows})).catch(()=>{if(!ctrl.signal.aborted)setState({file,error:true})});
    return ()=>ctrl.abort();
  },[file]);
  return state.file===file?state:{};
}
