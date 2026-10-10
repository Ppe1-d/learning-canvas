import {openThread,openBrowser} from './launcher.mjs';
const result=await openThread('local-home');await openBrowser(result.url);
