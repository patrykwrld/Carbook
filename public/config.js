// When the frontend is served from the same Cloudflare Worker as the API
// (via the ASSETS binding), leave this empty and requests stay same-origin.
// When hosting the frontend elsewhere (e.g. Vercel), set this to the
// deployed Worker's URL, e.g. "https://driver-signal.<subdomain>.workers.dev".
window.DRIVER_SIGNAL_API_BASE = '';
