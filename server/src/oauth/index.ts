/**
 * OAuth 2.1 Provider Router
 * 
 * Mounts all OAuth endpoints:
 * - /.well-known/oauth-authorization-server (discovery)
 * - /oauth/authorize (authorization)
 * - /oauth/token (token exchange)
 * - /oauth/userinfo (user profile)
 * - /oauth/revoke (token revocation)
 */

import { Hono } from 'hono';
import discovery from './discovery.js';
// import authorize from './authorize.js';  // TODO
// import token from './token.js';          // TODO
// import userinfo from './userinfo.js';    // TODO

const oauth = new Hono();

// Mount discovery at /.well-known
oauth.route('/.well-known', discovery);

// OAuth endpoints will be mounted here:
// oauth.route('/oauth', authorize);
// oauth.route('/oauth', token);
// oauth.route('/oauth', userinfo);

export default oauth;
