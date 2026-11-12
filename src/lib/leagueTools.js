export const toolsBySport = {
  nfl:[['Analyzer','analyzer'],['Props Board','props'],['Top Looks','top-eight'],['Moneylines','moneylines'],['Model Record','model-record']],
  cbb:[['Analyzer','cbb'],['Props Board','cbb-props'],['Top Props','cbb-top-eight'],['Games','cbb-games'],['Model Record','cbb-record']]
};
for(const sport of ['nba','cfb']){
  toolsBySport[sport]=toolsBySport.cbb.map(([label,path])=>[label,path.replace('cbb',sport)]);
}
