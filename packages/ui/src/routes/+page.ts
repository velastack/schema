// The editor drives SvelteFlow and reads its token from the URL fragment,
// neither of which exists on the server. The shell is still prerendered.
export const ssr = false;
export const prerender = true;
