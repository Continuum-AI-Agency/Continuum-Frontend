import { Window } from 'happy-dom';

const window = new Window({
    url: 'http://localhost:3000',
    width: 1024,
    height: 768,
});

global.window = window as any;
global.document = window.document as any;
global.navigator = window.navigator as any;
global.HTMLElement = window.HTMLElement as any;
global.HTMLInputElement = window.HTMLInputElement as any;
global.HTMLTextAreaElement = window.HTMLTextAreaElement as any;
// Add DocumentFragment which was missing
global.DocumentFragment = window.DocumentFragment as any;
