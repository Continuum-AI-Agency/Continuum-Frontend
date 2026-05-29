export type BrandIconData = {
  svg: string;
  title: string;
};

export const amazon: BrandIconData = {
  title: "Amazon",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#232F3E"/><path d="M7 9.4c.5-1.7 2-2.8 4.1-2.8 2.6 0 4.1 1.4 4.1 3.8v4.7h-2l-.2-1.1c-.7.8-1.7 1.3-3 1.3-1.8 0-3-1-3-2.6 0-1.8 1.4-2.8 4-3l1.8-.1v-.3c0-.9-.6-1.4-1.7-1.4-1 0-1.7.4-2 1.2L7 9.4Zm5.8 1.8-1.5.1c-1.3.1-1.9.5-1.9 1.2 0 .6.5 1 1.3 1 1.2 0 2.1-.8 2.1-1.9v-.4Z" fill="#fff"/><path d="M6.2 17.1c3.5 1.7 7.4 1.8 11.4.1" fill="none" stroke="#FF9900" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

export const facebook: BrandIconData = {
  title: "Facebook",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#1877F2"/><path d="M14.2 8.1h1.6V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H7.5v2.9h2.4v6.4h3v-6.4h2.4l.4-2.9h-2.8V9.5c0-.8.2-1.4 1.3-1.4Z" fill="#fff"/></svg>`,
};

export const google: BrandIconData = {
  title: "Google",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.1 3.3v2.7h3.4c2-1.8 3.3-4.6 3.3-8Z"/><path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7L16 17.6c-.9.6-2.2 1-4 1-3.1 0-5.7-2.1-6.6-4.9H1.9v2.8C3.7 20.3 7.5 23 12 23Z"/><path fill="#FBBC05" d="M5.4 13.7c-.2-.6-.4-1.3-.4-2s.1-1.4.4-2V6.9H1.9A11 11 0 0 0 1 11.7c0 1.7.4 3.3 1.1 4.8l3.3-2.8Z"/><path fill="#EA4335" d="M12 4.8c1.6 0 3.1.6 4.2 1.7l3.1-3.1A10.5 10.5 0 0 0 12 .4C7.5.4 3.7 3.1 1.9 6.9l3.5 2.8c.9-2.8 3.5-4.9 6.6-4.9Z"/></svg>`,
};

export const instagram: BrandIconData = {
  title: "Instagram",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="3" y1="21" x2="21" y2="3"><stop stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".65" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="2.5" y="2.5" width="19" height="19" rx="5.2" fill="url(#ig)"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.3" fill="#fff"/></svg>`,
};

export const linkedin: BrandIconData = {
  title: "LinkedIn",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="#0A66C2"/><path d="M6.2 9.8h3v8.7h-3V9.8Zm1.5-4.3c1 0 1.7.7 1.7 1.6s-.7 1.6-1.7 1.6S6 8 6 7.1s.7-1.6 1.7-1.6Zm3.5 4.3h2.9V11c.4-.7 1.3-1.5 2.8-1.5 2.9 0 3.5 1.9 3.5 4.4v4.6h-3V14c0-1.1 0-2.3-1.4-2.3s-1.7 1.1-1.7 2.3v4.5h-3V9.8Z" fill="#fff"/></svg>`,
};

export const meta: BrandIconData = {
  title: "Meta",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0668E1"/><path d="M4.5 14.4c0-3.7 1.8-6.8 4.2-6.8 1.6 0 2.8 1.2 3.7 2.7.9-1.5 2.1-2.7 3.7-2.7 2.4 0 4.2 3.1 4.2 6.8 0 2.2-.9 3.8-2.5 3.8-1.7 0-2.8-1.5-4.9-5.2l-.5-.8-.5.8c-2.1 3.7-3.2 5.2-4.9 5.2-1.6 0-2.5-1.6-2.5-3.8Zm2.1 0c0 1.2.3 1.7.8 1.7.8 0 1.5-.9 3.2-3.9-.7-1.4-1.3-2.3-2-2.3-1.1 0-2 2-2 4.5Zm6.8-2.2c1.7 3 2.4 3.9 3.2 3.9.5 0 .8-.5.8-1.7 0-2.5-.9-4.5-2-4.5-.7 0-1.3.9-2 2.3Z" fill="#fff"/></svg>`,
};

export const threads: BrandIconData = {
  title: "Threads",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#000"/><path d="M12 4.8c3.7 0 6.3 2.5 6.5 6.3 1.1.7 1.8 1.8 1.8 3.2 0 2.8-2.6 5-6.2 5-4.2 0-7.1-2.5-7.1-6.3 0-3.6 2.5-6.1 6.1-6.1 2.3 0 4 1.1 4.8 3.1l-2.2.7c-.4-1.1-1.3-1.7-2.6-1.7-2 0-3.4 1.6-3.4 3.9 0 2.5 1.8 4 4.4 4 2 0 3.5-1 3.5-2.4 0-1-.7-1.6-1.9-1.8-.6 1.6-2.1 2.6-4.2 2.6-1.8 0-3-1-3-2.4 0-1.5 1.3-2.5 3.3-2.5.7 0 1.4.1 2 .2-.3-2.3-1.6-3.5-4-3.5V4.8Z" fill="#fff"/></svg>`,
};

export const tiktok: BrandIconData = {
  title: "TikTok",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#000"/><path d="M15.4 6.1c.4 1.7 1.5 2.8 3.1 3.2v2.7c-1.2 0-2.3-.4-3.1-1v4.4c0 2.5-2 4.4-4.6 4.4-2.5 0-4.4-1.8-4.4-4.1 0-2.5 2-4.3 4.8-4.2v2.7c-1.2-.1-2 .5-2 1.5 0 .9.7 1.5 1.6 1.5 1 0 1.7-.7 1.7-1.8V6.1h2.9Z" fill="#fff"/><path d="M15.4 6.1c.2.9.7 1.7 1.4 2.2" fill="none" stroke="#25F4EE" stroke-width="1.5"/><path d="M8.2 15.9c0-1.6 1.1-2.9 3-3" fill="none" stroke="#FE2C55" stroke-width="1.5"/></svg>`,
};

export const youtube: BrandIconData = {
  title: "YouTube",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="5.5" width="20" height="13" rx="3.2" fill="#FF0033"/><path d="m10 9 6 3-6 3V9Z" fill="#fff"/></svg>`,
};
