export const nflColors={ARI:'97233f',ATL:'a71930',BAL:'563a88',BUF:'1865bc',CAR:'0085ca',CHI:'c83803',CIN:'fb4f14',CLE:'ff3c00',DAL:'256594',DEN:'fb4f14',DET:'0076b6',GB:'237052',HOU:'aa192f',IND:'155aa8',JAX:'00999a',KC:'e31837',LAC:'0080c6',LAR:'245ed1',LV:'90959a',MIA:'008e97',MIN:'6937a0',NE:'ba2436',NO:'bba46b',NYG:'2245a0',NYJ:'158453',PHI:'00796c',PIT:'ffb612',SEA:'69be28',SF:'c62127',TB:'d50a0a',TEN:'4595d2',WAS:'773141'};

export function teamColor(team,colors=nflColors){
  const value=colors?.[team] || (colors===nflColors && nflColors[{LA:'LAR',WSH:'WAS',JAC:'JAX'}[team]]);
  return /^#?[a-f0-9]{6}$/i.test(value || '') ? '#'+value.replace('#','') : undefined;
}
