export function gamePicks(game,model){
  const away=model?.a,home=model?.h;
  const margin=away&&home?home.score-away.score:null;
  const elo=game.context?.elo;
  const projectedTotal=away&&home?away.score+home.score:null;
  const homeProbability=elo?.homeProbability,awayProbability=elo?.awayProbability;
  const hasWinnerForecast=Number.isFinite(homeProbability)&&Number.isFinite(awayProbability);
  const winner=hasWinnerForecast&&Math.abs(homeProbability-awayProbability)>.0001
    ?(homeProbability>awayProbability?{team:game.home,probability:homeProbability}:{team:game.away,probability:awayProbability})
    :null;
  const spreadEdge=Number.isFinite(margin)&&Number.isFinite(game.homeSpread)?margin+game.homeSpread:null;
  const spreadTeam=spreadEdge==null||Math.abs(spreadEdge)<.05?null:spreadEdge>0?game.home:game.away;
  const spreadLine=spreadTeam===game.home?game.homeSpread:-game.homeSpread;
  const totalSide=Number.isFinite(projectedTotal)&&Number.isFinite(game.totalLine)
    ?projectedTotal-game.totalLine>.05?'OVER':game.totalLine-projectedTotal>.05?'UNDER':'NO CLEAR SIDE'
    :null;
  return {elo,margin,projectedTotal,winner,hasWinnerForecast,spreadTeam,spreadLine,spreadEdge,totalSide};
}

export const gameMarkets={moneyline:'Moneyline',total:'Over/Under',spread:'Spread'};

export function marketSnapshot(game,model){
  const {winner,spreadTeam,spreadLine,totalSide}=gamePicks(game,model);
  const markets={};
  if(winner)markets.moneyline={side:winner.team,probability:winner.probability,price:winner.team===game.home?game.homePrice:game.awayPrice};
  if(spreadTeam)markets.spread={side:spreadTeam,line:spreadLine,price:spreadTeam===game.home?game.homeSpreadPrice:game.awaySpreadPrice};
  if(totalSide==='OVER'||totalSide==='UNDER')markets.total={side:totalSide,line:game.totalLine,price:totalSide==='OVER'?game.overPrice:game.underPrice};
  return markets;
}

export function gameResult(row,market){
  const pick=row.markets?.[market];
  if(!pick)return 'No pick';
  if(row.final?.length!==2||!row.final.every(Number.isFinite))return 'Pending';
  const [away,home]=row.final;
  const margin=pick.side===row.home?home-away:away-home;
  const difference=market==='moneyline'?margin:market==='spread'?margin+pick.line:
    (home+away-pick.line)*(pick.side==='OVER'?1:-1);
  return difference===0?'Push':difference>0?'Win':'Loss';
}
