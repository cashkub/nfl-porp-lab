const pages = {
  '#analyzer':'analyzer', '#game-log':'analyzer', '#about':'analyzer',
  '#prop-lists':'prop-lists', '#props':'prop-lists', '#best-hit-rates':'prop-lists',
  '#top-eight':'nfl-top', '#top-five':'nfl-top', '#nfl-games':'nfl-games',
  '#moneylines':'nfl-games', '#model-record':'model-record'
};
export function activePage(hash=window.location.hash) { return pages[hash]; }
export function menuPath(url) {
  return url.hash==='#nfl-home' || (!url.hash && url.searchParams.get('view')==='nfl') ? '/preview/nfl/' : '/preview/';
}
