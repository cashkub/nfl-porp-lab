import {activePage,menuPath} from './routes.js';

const url=new URL(window.location.href);
if(url.searchParams.get('view')==='cbb' && /^#cbb-(charts|props|top|games|record|bracket)$/.test(url.hash)) import('./cbb/main.jsx');
else if(activePage(url.hash)) import('./main.jsx');
else window.location.replace(menuPath(url));
