import test from 'node:test';
import assert from 'node:assert/strict';
import {activePage,menuPath} from '../src/routes.js';

test('NFL tools and their older bookmarks resolve to the active NFL screens',()=>{
  for(const [hash,page] of Object.entries({
    analyzer:'analyzer','prop-lists':'prop-lists','top-eight':'nfl-top',
    'nfl-games':'nfl-games','model-record':'model-record',props:'prop-lists',moneylines:'nfl-games'
  }))assert.equal(activePage('#'+hash),page);
});
test('retired league bookmarks return to league selection',()=>{
  for(const league of ['nba','cfb','cbb'])for(const suffix of ['','-home','-props','-record','-games','-top-eight']){
    const url=new URL('https://example.org/#'+league+suffix);
    assert.equal(activePage(url.hash),undefined);
    assert.equal(menuPath(url),'/preview/');
  }
});
