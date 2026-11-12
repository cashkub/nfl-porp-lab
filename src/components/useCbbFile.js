import {useEffect,useState} from 'react';
import {useLeague} from './ManualLeague.jsx';

export function useCbbFile(path) {
  const sport=useLeague();
  const [result,setResult] = useState(null);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if (!path) return;
    const controller=new AbortController();
    fetch(import.meta.env.BASE_URL+'data/'+sport+'/'+path,{signal:controller.signal,cache:'no-cache'})
      .then(r=>{if (!r.ok) throw new Error();return r.json();})
      .then(data=>setResult({sport,path,data}))
      .catch(()=>{if (!controller.signal.aborted) setResult({sport,path,error:true});});
    return ()=>controller.abort();
  },[sport,path,retry]);
  return {data:result?.sport===sport && result.path===path ? result?.data : null,error:result?.sport===sport && result.path===path && result.error,
    reload:()=>{setResult(null);setRetry(n=>n+1);}};
}
