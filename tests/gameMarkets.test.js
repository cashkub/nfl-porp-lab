import test from 'node:test';
import assert from 'node:assert/strict';
import {marketSnapshot,gameResult} from '../src/lib/gamePicks.js';
import {publishedLook} from '../src/lib/publishedLooks.js';

const game={id:'g',home:'NYG',away:'WAS',homeSpread:-2.5,totalLine:41,homePrice:-142,homeSpreadPrice:-110,overPrice:-115,
  context:{elo:{homeProbability:.6,awayProbability:.4}}};
const model={a:{score:19},h:{score:24}};
test('archives the Games side, signed line, and price and grades against away/home finals',()=>{
  const markets=marketSnapshot(game,model);
  assert.deepEqual(markets,{moneyline:{side:'NYG',price:-142,probability:.6},spread:{side:'NYG',line:-2.5,price:-110},total:{side:'OVER',line:41,price:-115}});
  const row={...game,markets,final:[20,21]};
  assert.deepEqual(['moneyline','spread','total'].map(k=>gameResult(row,k)),['Win','Loss','Push']);
  assert.equal(gameResult({...row,final:null},'spread'),'Pending');
  assert.equal(gameResult({...row,markets:null},'total'),'No pick');
  const away=marketSnapshot({...game,homeSpread:-7,totalLine:49},model);
  assert.equal(away.spread.line,7);assert.equal(away.spread.side,'WAS');assert.equal(away.total.side,'UNDER');
  assert.equal(gameResult({...row,markets:away,final:[17,24]},'spread'),'Push');
  assert.equal(gameResult({...row,final:[17,17]},'moneyline'),'Push');
});
test('published Top Looks use exactly the archived market, side, line, price, and rank',()=>{
  const row={date:'2026-11-12',gameId:'g',playerId:'p',player:'Player',team:'WAS',away:'WAS',home:'NYG',metric:'rushingYards',side:'under',line:29.5,rank:2,look:{quote:{under:-110}},values:[21,34]};
  const look=publishedLook(row,[],[game]);
  assert.deepEqual([look.player.name,look.game.opponent,look.metric,look.side,look.line,look.quote.under,look.publishedRank],['Player','NYG','rushingYards','under',29.5,-110,2]);
});
