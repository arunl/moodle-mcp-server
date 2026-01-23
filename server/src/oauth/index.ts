/**
 * OAuth 2.1 Provider Router
 * 
 * Mounts all OAuth endpoints:
 * - /.well-known/oauth-authorization-server (discovery)
 * - /oauth/authorize (authorization)
 * - /oauth/token (token exchange)
 * - /oauth/userinfo (user profile)
 */

import { Hono } from 'hono';
import discovery from './discovery.js';
import authorize from './authorize.js';
import token from './token.js';
import userinfo from './userinfo.js';

const oauth = new Hono();

// Mount discovery at /.well-known
oauth.route('/.well-known', discovery);

// Mount OAuth endpoints
oauth.route('/oauth', authorize);
oauth.route('/oauth', token);
oauth.route('/oauth', userinfo);

export default oauth;
