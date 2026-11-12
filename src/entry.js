const url = new URL(window.location.href);
if (!url.hash || url.hash === '#home' || url.hash === '#nfl-home') {
  const nfl = url.hash === '#nfl-home' || url.searchParams.get('view') === 'nfl';
  url.pathname = nfl ? '/preview/nfl/' : '/preview/';
  url.hash = '';
  window.location.replace(url);
} else {
  import('./main.jsx');
}
