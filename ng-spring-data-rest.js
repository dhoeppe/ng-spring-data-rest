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
const path = require('path');
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const qs = require('qs');
const jsonTs = require('json-schema-to-typescript');
const fs = require('fs');
const fsExtra = require('fs-extra');
const mustache = require('mustache');
const _ = require('lodash');

// Declare constants
const REGEXP_TYPESCRIPT_INTERFACE_NAME = /^(export interface )(\w+)( {)$/m;
const REGEXP_TYPESCRIPT_INTERFACE_ATTRIBUTES = /^export interface \w+ {\n((.|\n)*)}$/m;
const PATH_CLASS_TEMPLATE = path.join(__dirname, './templates/class');
const PATH_SERVICE_TEMPLATE = path.join(__dirname, './templates/service');
const PATH_MODELS_TEMPLATE = path.join(__dirname, './templates/models');
const PATH_SERVICES_TEMPLATE = path.join(__dirname, './templates/services');

// Declare global variables
let axiosInstance = undefined;

/**
 * Entry point to this script, bootstraps the generation process.
 *
 * @param options The command line parameters and further configuration.
 */
function ngSpringDataRest(options) {
    // Axios instance setup
    axiosInstance = axios.create({
                                     baseURL: options.baseURL,
                                     withCredentials: true,
                                     timeout: 10000
                                 });
    axiosCookieJarSupport(axiosInstance);
    axiosInstance.defaults.jar = new tough.CookieJar();
    
    // Mustache setup
    mustache.tags = ['$$@', '@$$'];
    
    doGenerate(options);
}

/**
 * Generates the output classes.
 *
 * @param options The command line parameters and further configuration.
 */
async function doGenerate(options) {
    if (options.authMethod !== 'NONE') {
        try {
            await doLogin(options);
            console.log(`Authenticated as user ${options.username}.`);
        } catch {
            console.error(`Authentication failed.`);
            process.exit(5);
        }
    }
    
    // Collect models to generate files for.
    const entities = await collectEntities();
    console.log('Collected list of entities.');
    
    // Collect JSON schemas.
    const jsonSchemas = await collectSchemas(entities);
    
    // Create output directory.
    fs.mkdirSync(`${options.outputDir}/${options.modelDir}`,
                 {recursive: true});
    fs.mkdirSync(`${options.outputDir}/${options.serviceDir}`,
                 {recursive: true});

    // Empty output directory
    fsExtra.emptyDirSync(`${options.outputDir}/${options.modelDir}`);
    fsExtra.emptyDirSync(`${options.outputDir}/${options.serviceDir}`);
    
    // Process JSON schemas based on configuration.
    preProcessSchemas(jsonSchemas, options);
    
    // Convert each schema to TypeScript classes and services.
    generateTypeScriptFromSchema(jsonSchemas,
                                 entities,
                                 options.outputDir,
                                 options.modelDir,
                                 options.serviceDir);
}

/**
 * Performs the login based on the provided authentication method.
 *
 * @param options The command line options.
 * @returns {Promise} promise for the request.
 */
function doLogin(options) {
    // Login if necessary with the specified method.
    switch (options.authMethod) {
        case 'COOKIE':
            return authenticateWithCookies(options.authEndpoint,
                                           options.username,
                                           options.password);
        case 'OAUTH2':
            return authenticateWithOAuth2(options.oauthFlow,
                                          options.authEndpoint,
                                          options.username,
                                          options.password,
                                          options.clientId,
                                          options.clientPassword)
                .then(response => {
                    axiosInstance.defaults.headers.common['Authorization'] = response.data.access_token;
                })
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
 * @param authEndpoint The authentication endpoint URL to use, fully qualified.
 * @param username
 * @param password
 * @returns {Promise} Promise for the POST request to the authentication endpoint.
 */
function authenticateWithCookies(authEndpoint, username, password) {
    return axiosInstance.post(authEndpoint,
                              qs.stringify({
                                               username: username,
                                               password: password
                                           }));
}

/**
 * OAuth2 authentication
 *
 * Currently only supports the PASSWORD flow without scopes.
 *
 * @param flow The authorization flow to use when authenticating.
 * @param authEndpoint The authentication endpoint URL to use, fully qualified.
 * @param username
 * @param password
 * @param client
 * @param clientPassword
 * @returns {Promise} Promise for the POST request to the authentication endpoint.
 */
function authenticateWithOAuth2(flow, authEndpoint, username, password, client, clientPassword) {
    switch (flow) {
        case 'PASSWORD':
            return axiosInstance.post(authEndpoint,
                                      qs.stringify({
                                                       grant_type: 'password',
                                                       username: username,
                                                       password: password,
                                                       client_id: client,
                                                       client_secret: clientPassword
                                                   }),
                                      {
                                          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                                          auth: {
                                              username: client,
                                              password: clientPassword
                                          }
                                      });
    }
}

/**
 * Retrieves an array of repository endpoint names provided by Spring Data REST using
 * the <host>/<basePath>/profile endpoints.
 *
 * @returns {Promise<[]>} Promise for an array of strings containing the repository names.
 */
function collectEntities() {
    return axiosInstance.get('profile')
        .then(response => {
            if (!('_links' in response.data)) {
                console.error(
                    'Response does not contain _links element. Could not collect entities.');
                process.exit(4);
            }
            
            const keys = Object.keys(response.data._links);
            removeElementFromArray(keys, 'self');
            return keys;
        })
        .catch(() => {
            console.error('Collecting entities failed.');
            process.exit(3);
        });
}

/**
 * Retrieves the JSON schema provided by Spring Data REST for each of the entities in the given array.
 *
 * @param entities An array containing strings with the name of each repository in Spring Data REST.
 * @returns {Promise<[]>} Promise for an array of JSON schemas.
 */
async function collectSchemas(entities) {
    const schemas = [];
    console.log('Collecting schemas.');
    
    for (const element of entities) {
        await axiosInstance.get(`profile/${element}`,
                                {headers: {'Accept': 'application/schema+json'}})
            .then(response => {
                schemas.push(response.data);
            })
            .catch(() => {
                console.error(`Could not collect schema for '${element}'.`);
                process.exit(4);
            });
    }
    
    return schemas;
}

/**
 * Pre-Processes schemas according to the given configuration.
 *
 * @param schemas
 * @param config
 */
function preProcessSchemas(schemas, config) {
    for (const schema of schemas) {
        if (config.noAdditionalProperties) {
            schema.additionalProperties = false;
        }
    }
}

/**
 * Generates TypeScript classes in the 'model' directory from the given JSON schemas.
 *
 * @param schemas The JSON schemas to convert.
 * @param entities The array of entities, must match the schemas array.
 * @param outputDir The output directory to use. Models are generated in the 'model' subdirectory.
 * @param modelDir The name of the model directory.
 * @param serviceDir The name of the service directory.
 */
async function generateTypeScriptFromSchema(schemas, entities, outputDir, modelDir, serviceDir) {
    console.log(`Generating files.`);
    
    const classTemplateString = fs.readFileSync(PATH_CLASS_TEMPLATE).toString();
    const serviceTemplateString = fs.readFileSync(PATH_SERVICE_TEMPLATE).toString();
    const modelsTemplateString = fs.readFileSync(PATH_MODELS_TEMPLATE).toString();
    const servicesTemplateString = fs.readFileSync(PATH_SERVICES_TEMPLATE).toString();
    const modelsTemplateData = { 'models': [] };
    const servicesTemplateData = { 'services': [] };

    for (let index = 0; index < schemas.length; index++) {
        const schema = schemas[index];
        const entity = entities[index];

        // Apply json-schema-to-typescript conversion.
        let interfaceDefinition = await jsonTs.compile(schema, schema.title, { bannerComment: null });

        // Add I to the beginning of each class name to indicate interface.
        interfaceDefinition = interfaceDefinition.replace(REGEXP_TYPESCRIPT_INTERFACE_NAME, '$1I$2$3');

        // Construct filename for generated interface file.
        let matches = interfaceDefinition.match(REGEXP_TYPESCRIPT_INTERFACE_NAME);

        const interfaceName = matches[2];
        const className = interfaceName.substr(1);
        const classNameKebab = _.kebabCase(className);

        // Extract the attributes from the interface file
        matches = interfaceDefinition.match(REGEXP_TYPESCRIPT_INTERFACE_ATTRIBUTES);
        const classAttributes = matches[1];

        // Create class from template file.
        const classTemplateData = {
            'interfaceDefinition': interfaceDefinition,
            'interfaceName': interfaceName,
            'className': className,
            'classAttributes': classAttributes
        };
        const renderedClass = mustache.render(classTemplateString,
                                              classTemplateData);
        const classFileName = `${classNameKebab}.ts`;
        fs.writeFileSync(`${outputDir}/${modelDir}/${classFileName}`,
                         renderedClass);

        // Create service from template file.
        const serviceTemplateData = {
            'className': className,
            'classNameKebab': classNameKebab,
            'modelDir': modelDir,
            'repositoryName': entity
        };
        const renderedService = mustache.render(serviceTemplateString,
                                                serviceTemplateData);
        const serviceFileName = `${classNameKebab}.service.ts`;
        fs.writeFileSync(`${outputDir}/${serviceDir}/${serviceFileName}`,
                         renderedService);

        // Append to models and services list
        modelsTemplateData.models.push({
            'modelClass': interfaceName,
            'modelDir': modelDir,
            'modelFile': classNameKebab
        });
        modelsTemplateData.models.push({
            'modelClass': className,
            'modelDir': modelDir,
            'modelFile': classNameKebab
        });
        servicesTemplateData.services.push({
            'modelClass': className,
            'serviceDir': serviceDir,
            'modelFile': classNameKebab
        });
    }

    // Render list of models and services
    const renderedModel = mustache.render(modelsTemplateString, modelsTemplateData);
    fs.writeFileSync(`${outputDir}/${modelDir}.ts`, renderedModel);
    const renderedServices = mustache.render(servicesTemplateString, servicesTemplateData);
    fs.writeFileSync(`${outputDir}/${serviceDir}.ts`, renderedServices);
}

/**
 * Removes an element from an array in-place.
 *
 * @param array The array to process.
 * @param element The element to remove from the array.
 */
function removeElementFromArray(array, element) {
    const elementIndex = array.indexOf(element);
    if (elementIndex > -1) {
        array.splice(elementIndex, 1);
    }
}

module.exports = ngSpringDataRest;
