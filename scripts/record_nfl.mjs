import fs from 'node:fs';
import {projection} from '../src/lib/projection.js';
const path='public/data/model-record.json';
const records=new Map(JSON.parse(fs.existsSync(path)?fs.readFileSync(path):'[]').map(r=>[r.id,r]));
const data=JSON.parse(fs.readFileSync('public/data/stats.json'));
const now=Date.now();
for(const g of data.schedule || []){
  const kickoff=Date.parse(g.kickoff);
  if(!g.id || !g.timeKnown || kickoff<=now || kickoff-now>7*86400000 || records.get(g.id)?.final)continue;
  if(!g.context?.away || !g.context?.home)continue;
  const m=projection(g,g.awayRating,g.homeRating);
  if(!m)continue;
  records.set(g.id,{id:g.id,away:g.away,home:g.home,kickoff:g.kickoff,saved:new Date(now).toISOString(),
    stats:[m.a.score,m.h.score],blend:m.blend?[m.blend.away,m.blend.home]:null});
}
fs.writeFileSync(path,JSON.stringify([...records.values()].sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)))+'\n');
