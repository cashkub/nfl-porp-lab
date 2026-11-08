import {markets as basketball} from './cbbMarkets.js';
import {METRICS} from './stats.js';

export const sportNames={nfl:'Pro Football',cbb:'Men’s College Basketball',nba:'Pro Basketball',cfb:'College Football · FBS'};
export const manualMarkets=sport=>sport==='cfb'?METRICS:basketball;
export const seasonLabel=(sport,y)=>sport==='cfb'?String(y):String(y-1)+'–'+String(y).slice(-2);
