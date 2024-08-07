// main-mapis.js
// Copyright © 2024 Joel A Mussman. All rights reserved.
//

import { createAuth0Client } from '@auth0/auth0-spa-js';
import { jwtDecode } from 'jwt-decode';
import 'dotenv/config';

// Wait for the page load, then set everything up.

window.addEventListener('load', async () => {

    // Establish the authentication client. Because two /autorization calls will be chained in sequence,
    // local storage must be used to hold the tokens or they will disappear when the SPA unloads!
    // Warning: enabling this means that malware could compromise the access tokens because the
    // storage location and schema is well-known for the browsers.

    const auth0ClientOptions = {
        domain: process.env.DOMAIN,
        clientId: process.env.CLIENTID,
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
        authorizationParams: {
            audience: `https://${process.env.DOMAIN}/api/v2/`,
            redirect_uri: `${window.location.origin}/profile/callback`,
            scope: 'openid profile email read:current_user'
        }
    };

    const auth0Client = await createAuth0Client(auth0ClientOptions);
     
    // Establish the authentication client for the reports API.

    const auth0ReportsApiClientOptions = {
        domain: process.env.DOMAIN,
        clientId: process.env.CLIENTID,
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
        authorizationParams: {
            audience: `https://expenses-api`,
            redirect_uri: `${window.location.origin}/reports/callback`,
            scope: 'openid profile email read:reports'
        }
    };

    const auth0ReportsApiClient = await createAuth0Client(auth0ReportsApiClientOptions);

    // Attempt to process a callback from /authorize, if present. There are two paths
    // that could be presented here, and a different handler must be invoked for each.

    try {

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const pathname = window.location.pathname;
        
        if (code) {

            if (pathname.includes('/profile/callback')) {

                // The redirectResult is ignored in this code, but it carries the state passed in the
                // call to /authorize. State is an alternative way to isolate which handler to use.
        
                const redirectResult = await auth0Client.handleRedirectCallback();
                
                // The /authorize calls *must* be issued sequentially; this call cannot be done from the
                // click handler because the first /authorize call will unload the SPA (and it will never
                // happen). The only solution is to chain it so it happens after the first /authorize has
                // been resolved.
                //
                // The user *will* see a flicker here for the second call to /authorize.
                
                await auth0ReportsApiClient.loginWithRedirect();

            } else if (pathname.includes('/reports/callback')) {
     
                const redirectResult = await auth0Client.handleRedirectCallback();
            }
        }
    }

    catch (e) {
        
        console.log(e);
    }

    // The page content depends on authentication.

    const clientIsAuthenticated = await auth0Client.isAuthenticated();
    const reportsApiClientIsAuthenticated = await auth0ReportsApiClient.isAuthenticated();

    if (clientIsAuthenticated && reportsApiClientIsAuthenticated) {

        // Esablish the sign-out button.

        const authenticationLink = document.getElementById('authenticationLink');

        authenticationLink.innerHTML = 'Sign Out';
        authenticationLink.addEventListener('click', async () => {

            await auth0Client.logout({
                logoutParams: {
                    federated: true,
                    returnTo: window.location.origin
                }
            });
        });

        // Get the  user information.

        const user = await auth0Client.getUser();                 // Parsed user.
        const claims = await auth0Client.getIdTokenClaims();      // Raw claims (if possible).

        // Get the access token and call the management API for the full profile. This depends heavily
        // on useRefreshTokens being true in the client, so that the refresh token is used in place of
        // of a third-party session cookie. If the refresh token is not used, and an existing token has
        // expired, getTokenSilently() will try to use the third-party cookie and will fail.

        const managementApiAccessToken = await auth0Client.getTokenSilently();
        const managementApiAtDecoded = jwtDecode(managementApiAccessToken);

        // Pull /userinfo.

        let apiResponse = await window.fetch(`https://${auth0ClientOptions.domain}/userinfo`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${managementApiAccessToken}`
            }
        });

        const userinfo = await apiResponse.json();

        // Pull user profile.

        apiResponse = await window.fetch(`${auth0ClientOptions.authorizationParams.audience}users/${user.sub}`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${managementApiAccessToken}`
            }
        });
        
        const profile = await apiResponse.json();

        // Get the reports API token; do not fetch, this is only to demonstrate getting both tokens.

        const reportsApiAccessToken = await auth0ReportsApiClient.getTokenSilently();
        const reportsApiAtDecoded = jwtDecode(reportsApiAccessToken);

        // Put it all together and showt the results.

        const pageContents = document.getElementsByClassName('content');

        if (pageContents.length) {
                
            pageContents[0].innerHTML = `
                <h1>${user.name ? user.name : user.email}</h1>

                <h2>ID Token and Claims</h2>

                <pre>${JSON.stringify(claims, null, 4)}</pre>

                <h2>auth0Client.user (parsed from the ID token)</h2>

                <pre>${JSON.stringify(user, null, 4)}</pre>

                <h2>Authentication/Management API access token</h2>

                <pre>${managementApiAccessToken}</pre>
                <pre>${JSON.stringify(managementApiAtDecoded, null, 4)}</pre>

                <h2>/userinfo from the Authentication Server</h2>

                <pre>${JSON.stringify(userinfo, null, 4)}</pre>

                <h2>User profile via the Management API</h2>

                <pre>${JSON.stringify(profile, null, 4)}</pre>
                
                <h2>Reports API access token</h2>

                <pre>${reportsApiAccessToken}</pre>
                <pre>${JSON.stringify(reportsApiAtDecoded, null, 4)}</pre>
            `;
        }

    } else {

        // Establish the sign-on and profile menu links.

        const authenticationHandler = async () => {

            await auth0Client.loginWithRedirect();
        };

        const authenticationLink = document.getElementById('authenticationLink');
        const profileLink = document.getElementById('profileLink');

        authenticationLink.innerHTML = 'Sign-On';
        authenticationLink.addEventListener('click', authenticationHandler);
        profileLink.addEventListener('click', authenticationHandler);

        // The iconURL variable is simply to force Parcel to bundle the image so we can use it.

        const iconURL = new URL('../images/favicon.ico', import.meta.url);
        const pageContents = document.getElementsByClassName('content');

        if (pageContents.length) {
                
            pageContents[0].innerHTML = `           
                <h1>Welcome to the Pyrates of the Caribbean!</h1>
                <p class="welcome">
                    Here you can earn rewards for the treasure you report!
                    And, you can see how you stack up against the competition.
                </p>
                <p class="welcome">If you already have an account then come on board, you know how.
                    <img src="${iconURL}" /></p>
                <p class="welcome">If you want to join us, click on the Sign On link in the menu at the left,
                    and use the Sign up link on the login form to register a new account for our website.
                    Or, click the Sign On link and pick your favorite social media account to sign on and register in one step!</p>
            `;
        }
    }
});