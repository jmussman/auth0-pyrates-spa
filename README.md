[//]: # (README.md)
[//]: # (Copyright © 2024 Joel A Mussman. All rights reserved.)
[//]: #

![Banner Light](./.assets/banner-auth0-pyrates-spa-light.png#gh-light-mode-only)
![banner Dark](./.assets/banner-auth0-pyrates-spa-dark.png#gh-dark-mode-only)

# Auth0-Pyrates-SPA

## Overview

There are several things that are not clear when you build a single-page application using the auth0-spa-js SDK.
What about third-party cookies?
What are the issues using refresh tokens?
How do you handle access tokens for multiple APIs?
And plenty of other little gotchas, and this example attempts to address as many of these as possible.

This is a stripped-down SPA application built and run with [*Parcel*](https://parceljs.org/).
Other than some supporting resources, this example contains only an index.html file and a main.js script that drives the authentication and output.
This keeps the code at a minimum, and you can extrapolate from this into your favorite framework like Angular or React.
The only application output is the information about the sign on: the ID token, the parsed ID token, and the results of calling the /userinfo endpoint
at the authentication server.

## Configuration

1. Clone this project to your local computer, or launch it as a codespace from the repository at GitHub.
1. Create a new single-page application integration in your Auth0 tenant, name it whatever you would like.
1. Suggestion: populate the user for testing with user_metadata and app_metadata, because the output will reveal that app_metadata is visible to the user.
It is often assumed that app_metadata is a place to put secure data, but the truth is that and application acting on behalf of
the user cannot write it but it can still read it!
1. Populate the project .env file with the domain and client values from the SPA integration in the tenant.
1. Run *npm install*.
1. Launch the program with *npm dev*.
Ignore any deprecation warnings, they are not important for the example.
While we have done everything possible to remove old dependencies, a lot of times open-source dependencies an application relies on
have not been updated when they too have a deprecated dependency.
1. Browse to the application: in the VSCode terminal use ctrl-click to click on the application URL in the browser (use cmd-click on a Mac).
If you are running in a GitHub Codespace ctrl-click will still work and it will open the mapped URL into the codespace.
1. Click the Sign On menu link at the left, log into your tenant, and see the information about the user displayed on the page.
Note that since this application is running with an http://localhost address, Auth0 will *always* force the user to consent for the application.
This is because Auth0 is concerned about malware applications hijacking and using the localhost address.
Developers simply need to know this is going to happen.

## Token Expiration and Sessions

In this example if the user is not authenticated, they land on a welcome page.
The page has a menu link which will trigger authentication, but the process only starts when the link is clicked.
More precisely, the *isAuthenticated()* method in the client is used, it returns true if there is a cached ID Token and
if the token has not expired.
When the user is authenticated, the application displays the user information, otherwise it displays the menu link and
a welcome page.
Not having a valid token is the same as not having a session in a regular Web application.
A clear picture of the authentication flow over the network will help explain this:

![Banner Light](./.assets/flow-light.png#gh-light-mode-only)
![banner Dark](./.assets/flow-dark.png#gh-dark-mode-only)

1. The user loads the application.

2. The authentication client sees the user as not authenticated, so it redirects the browser to the authorization server to get
the user's information.
This is your Auth0 tenant.
Redirecting unloads the SPA from the browser.
If the authorization server has a session for the user, it responds by redirecting the browser back to the application with
and authorization "code" (so the user sees a flicker when this happens).
In the *handleRedirectCallback()* method of the authentication client the application will contact the authorization server
directly with an HTTP request and exchange the code for the ID and access tokens.
Technically the flow used for a SPA is "authorization-code flow with proof key for code exchange."

3. If the authorization server does not have a session for the user, it redirects the browser to the login application page.
The login application establishes the session, and redirects the user back to the authorization server, which redirects
the browser back to the application with the authorization code.

The expiration of the ID token is controlled by the settings for the application in the Auth0 admin console.
The session lifetime is controlled with the global settings in the admin console, but it could be shorter or longer than
the lifetime of the ID token.
Even if the session expires, the user will still be considered authenticated if the ID token has not expired.

Now for the tricky part: what do you do if the application has a state and the user becomes unauthenticated?
Well, clicking the logout menu option first *deletes* the token in the SPA, and second calls the /logout endpoint in the authentication server
which delets the session at Auth0.
But what if the user walks away and both the token andd the session expire?

1. Best practice: do not keep state locally, move everything through calls to a back-end API immediately.
Then unloading the SPA will not loose anything when it unloads for authentication.
There are other advantages too: the application is only the user interface, it does not implement business rules so security around those
rules cannot be compromised, etc.
1. Cache the state in local storage so it persists through authentication and the SPA reload.
Of course this means that the data in the stae is accessible from malware.
1. Look to the *loginWithPopup()* method of the authentication client which opens a popup window to call the authorization server
instead of unloading the SPA.
Unfortunately for anything with a poup, browsers will generally not allow a popup window anymore unless it is launched from a user-triggered event in the browser.
Worse, in Chrome (and other browsers) even a user triggered popup requires consent, so this depends on the user manually allowing the window for authentication to work!

## API Access Tokens

Switching from *main.js* to *main-api.js* in the index.html file will demonstrate the logic to support using an API.
Simply make the change and visit the page, the user profile will be displayed.

In this case the API chosen is the Management API for the Auth0 tenant, which can be used to retrieve the full user profile.
The audience *must exactly match* the audience defined for the API in the admin console; in the case of the Management API note the
trailing / in the configuration on the API settings tab.

The access tokens obtained to act on behalf of a user with the Management API do not follow the permissions defined for
machine-to-machine applications.
The permissions for the current authenticated user are always enabled, are a blind set (not visible in the admin console), and
documented at [Get Management API Access Tokens for Single-Page Applications](https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens/get-management-api-tokens-for-single-page-applications).

In the code the audience for the Management API and the scopes *offline_access* and *read:current_user* have been added to the AuthorizationParams
for the authentication client.
*offline_access* is not added directly to the scopes, it is preferrable to add the *useRefreshTokens: true* attribute to the client configuration, and
that will add the scope.
The only way to pick up the access token from the Auth0 client is to call the *getAccessTokenSilently()* method on the client.
If an unexpired access token is currently cached, it is returned.
Otherwise, another call to /authorize is made via JavaScript to pick up a new access token and return it.

That JavaScript call is a problem.
Traditionally the session cookie would be used to verify the user still has a session at the Auth0 tenant,
but sending the cookie in a JavaScript request is using it as a third-party cookie and that is no longer possible in Chrome >= 2024 and
other browsers are following.
To work around the session cookie if a refresh token was requested in the original authentication with the scope *offline_access*
and cached in the application, the SDK will pass that token in the call and the tenant can use to see if a valid session still exists.
From now on to use access tokens *offline_access* must be requested.

## Multiple APIs and Access Tokens in a single SPA

Variations of this question pop up frequently in the Auth0 developer forums:
"How do I get multiple access tokens for my SPA to talk to more than one API?"

First, you should really should not.
A better solution is to get *one* access token for *a single, internal API* behind your application.
That API can get its own access token as a machine-to-machine application to access the Management API at Auth0,
along with doing whatever else it is good for.
That API must be relied on to use the *sub* claim in the access token presented to it and restrict what user it works for
in the Management API.
The back-end API is more secure than the SPA, and even if a phishing application manages to stand in for the real application,
it can still only do what the real application could on behalf of the user.

But if you are really set on accessing multiple APIs from a SPA...

Another version of the main.js file, main-mapis.js, is included in the source with the code to retrieve two access
tokens, for two APIs (one is the Management API).
To make this work two changes have to be made:
1. Change the script in index.html to load main-mapi.js instead of main.js (or main-api.js), and the output will show
the additional access token.
2. Before running the program create an API in the Auth0 tenant with a name of Reports, an audience of *https://expenses-api*, and a
permission of *read:reports*.

The *main-mapis.js* script "chains" two calls to /authorize.
It uses two authentication clients, one for each call.
Each client uses a separate callback URL, so that the application can determine which callback to process when it arrives.
And, the calls must happen sequentially, and the SPA gets unloaded twice.
To make this work, the tokens from the first callback must be placed in local storage with the if they are in memory they will
get unloaded with the SPA.
Make the first call to /authorize, and when handling the first callback trigger the second call to /authorize.

Note for developers: there are three ways to figure out which handler must be called for a particular callback.
The first is the recommended approach:

1. Use a different pathname for each callback URL, and check the pathname to dispatch the correct handler

1. Send state data and pull it from the query string in the callback to dispatch the correct handler.
The handler does return the state, but by then it is too late.

1. Additional query parameters may pass through and be returned in the callback, they could be used in the
same fashion as state.

## Gotchas and Mythconceptions

1. The authentication client caches an ID token, an access token, and possibly a refresh token.
These are stored in either the session or local storage using the audience and scope as the hash key.
The access token may be a JWT for an API, or it may be an opaque token that only works with the /userinfo authentication server endpoint.
Knowing these two facts is important.

1. The authentication methods *loginWithPopup()* and *getTokenWithPopup()* are useless in modern browsers because
users must manually consent to the popup window opening. There is a significant risk they will not.

1. Auth0 always provides an ID Token; the *openid* scope is hardwired in the SDK even if not asked for by the application.
This is not necessarily a bad thing, but you want to know the SDK is going to do it.

1. Only the ID token and its expiration controls the state of the *isAuthenticated()* authentication client method.
The access token expiration and the Auth0 session expiration have no bearing.

1. Watch out for example code on GitHub, including this repository!
The various options schema for the Auth0 client has changed several times,
this is the current schema: https://auth0.github.io/auth0-spa-js/interfaces/Auth0ClientOptions.html.
Many examples in GitHub will not work out of the box without fixing the options.

1. The only viable option for getting the ID and access token is to call *getTokenSilently()*, because of #1.
*getTokenSilently()* only makes an HTTP request when a cached token has expired or does not exist.

1. Asking *getTokenSilently()* with different options than the original authentication client (audience, scope, etc.)
only works when an Auth0 session cookie is used with the HTTP request (which is the default).

1. Calling *getTokenSilently()* with an Auth0 session cookie is not longer viable.
Because this is a JavaScript HTTP request the session cookie becomes a third-party cookie and Chrome >= the year 2024 and other browsers will no longer allow this.
A 'login required' error message will be thrown and printed on the developer console.
Oops.
So, the best practice is to add *useRefreshTokens: true* to the authentication client options.
With this the client will pass the refresh token instead of trying to use the third-party session cookie.
Auth0 will accept the refresh token in lieu of a session cookie as proof the user is authenticated.
The user session must still be active.
Refresh tokens for SPA applications are rotated; all of the tokens returned replace anything in the cache.

1. The audience and scope cannot be changed in the call to *getTokenSilently()* when a refresh token is used.
The audience and scope make up the key in the cache for the tokens, so if the are changed no refresh token is found.
So, when refresh tokens are used it is not possible to request a new access token with a different scope, or an
access token with a different audience.

1. Adding the application to allowed origins for the SPA integration is necessary if *getTokenSilently()* needs to make an HTTP request.

1. The CORS enablement for the SPA integration is irrelevant for getting tokens or using the Management API.
This setting is only necessary when the [*Lock widget*](https://github.com/auth0/lock) is served locally (cross-origin authentication), or custom code needs
to send background requests to the authorization server.

1. Multiple API token requests require multiple authentication clients, separate handlers for the callback for each, and most importantly
the /authorize requests must be done sequentially because the browser needs to see the callback redirect each time.
Another way to clarify this is the /authorize call for the second token may not happen until the callback for the first request
has been completed.

1. The Management API calls do not use the API permissions presented in the Auth0 administrative interface.
What the application may do on the user's behalf is restricted to a special, internal set of permissions defined at
[Get Management API Access Tokens for Single-Page Applications](https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens/get-management-api-tokens-for-single-page-applications).
These scopes must be requested from the authorization server.

1. .env files to externalize settings are not limited to Node.js applications.
Parcel will bundle the environment and the *dotenv* package works in the SPA too.

1. If fetch is rejected by the Management API, these are the top issues:
    1. The audience is incorrect (are you missing the trailing slash?)
    1. The Accept header does not line up: use */* or application/json.
    1. Bearer token problems: right token? the token has the necessary scopes?

## License

The code is licensed under the MIT license. You may use and modify all or part of it as you choose, as long as attribution to the source is provided per the license. See the details in the [license file](./LICENSE.md) or at the [Open Source Initiative](https://opensource.org/licenses/MIT).


<hr>
Copyright © 2024 Joel A Mussman. All rights reserved.