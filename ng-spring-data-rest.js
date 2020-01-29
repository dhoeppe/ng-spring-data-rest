/*
 * This file is part of the ng-spring-data-rest project (https://github.com/dhoeppe/ng-spring-data-rest).
 * Copyright (c) 2020 Daniel Höppe.
 *
 * ng-spring-data-rest is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.
 *
 * ng-spring-data-rest is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with ng-spring-data-rest.  If not, see https://github.com/dhoeppe/ng-spring-data-rest.
 */

'use strict';

// Load dependencies
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const qs = require('qs');

// Declare global variables
let axiosInstance = undefined;

/**
 * Entry point to this script, bootstraps the generation process.
 *
 * @param options The command line parameters and further configuration.
 */
function ngSpringDataRest(options) {
    axiosInstance = axios.create({
        baseURL: options.baseURL,
        withCredentials: true,
        timeout: 10000
    });
    axiosCookieJarSupport(axiosInstance);
    axiosInstance.defaults.jar = new tough.CookieJar();

    doGenerate(options);
}

/**
 * Generates the output classes.
 *
 * @param options The command line parameters and further configuration.
 */
async function doGenerate(options) {
    let response;
    if (options.authMethod !== 'NONE') {
        try {
            response = await doLogin(options.authMethod, options.authEndpoint, options.username, options.password);
        } catch {
            console.error(`Authentication failed.\n\n${response}`);
        }
    }

    // Collect models to generate files for.
    const entities = collectEntities();

    // Collect JSON schemas.

    // Generate services.
}

/**
 * Performs the login based on the provided authentication method.
 *
 * @param authMethod
 * @param authEndpoint
 * @param username
 * @param password
 * @returns Promise promise for the request.
 */
function doLogin(authMethod, authEndpoint, username, password) {
    // Login if necessary with the specified method.
    switch (authMethod) {
        case 'COOKIE':
            return authenticateWithCookies(authEndpoint, username, password);
    }
}

/**
 * Cookie authentication
 *
 * The POST request body equals to the following:
 *
 * {
 *     username: "...",
 *     password: "..."
 * }
 *
 * @param authEndpoint The authentication endpoint to use, fully qualified.
 * @param username
 * @param password
 */
function authenticateWithCookies(authEndpoint, username, password) {
    return axiosInstance.post(authEndpoint,
        qs.stringify({username: username, password: password}));
}

function collectEntities() {
    axiosInstance.get('profile')
        .then(response => {
            // TODO process
        });

    return [];
}

module.exports = ngSpringDataRest;
