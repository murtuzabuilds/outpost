// The full-page app.
import { boot } from './main.js';
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(document)); else boot(document);
