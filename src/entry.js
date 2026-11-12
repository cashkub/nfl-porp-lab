import {activePage,menuPath} from './routes.js';

const url=new URL(window.location.href);
if(activePage(url.hash)) import('./main.jsx');
else window.location.replace(menuPath(url));
