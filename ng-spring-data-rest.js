/*
 * This file is part of the ng-spring-data-rest project (https://github.com/dhoeppe/ng-spring-data-rest).
 *
 * MIT License
 *
 * Copyright (c) 2020 Daniel Höppe
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
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
const pluralize = require('pluralize');

// Declare constants
const REGEXP_TYPESCRIPT_INTERFACE_NAME = /^(export interface )(\w+)( {)$/m;
const REGEXP_TYPESCRIPT_INTERFACE_ATTRIBUTES = /^export interface \w+ {\n((.|\n)*?)}$/m;
const REGEXP_RT_ENTITY_NAME = /#(\w+)-/;
const REGEXP_OWN_ENTITY_NAME = /(\w+)-/;
const STR_APPEND_REGEXP_TYPESCRIPT_PROPERTY_TYPE = '\\??: )(.+)(;)$';
const STR_REGEXP_TYPESCRIPT_EXPORT_TYPE = 'export type $$@$$.*;\\n';
const STR_IMPORT_REPLACE = 'import { Resource } from \'@lagoshny/ngx-hal-client\';';
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
 * Generates the output files.
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
    const entities = await collectRepositories();
    console.log('Collected list of entities.');
    
    // Collect JSON schemas.
    await collectSchemas(entities);
    await collectAlpsAndPopulateNames(entities);
    
    // Process JSON schemas based on configuration.
    preProcessSchemas(entities, options);
    
    // Create output directory.
    fs.mkdirSync(`${options.outputDir}/${options.modelDir}`,
                 {recursive: true});
    fs.mkdirSync(`${options.outputDir}/${options.serviceDir}`,
                 {recursive: true});
    
    // Empty output directory.
    fsExtra.emptyDirSync(`${options.outputDir}/${options.modelDir}`);
    fsExtra.emptyDirSync(`${options.outputDir}/${options.serviceDir}`);
    
    // Convert each schema to TypeScript classes and services.
    await generateTypeScriptFromSchema(entities,
                                       options.outputDir,
                                       options.modelDir,
                                       options.serviceDir);
}

/**
 * Performs the login based on the provided authentication method.
 *
 * @param options The command line parameters and further configuration.
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
                    axiosInstance.defaults.headers.common['Authorization'] = 'Bearer ' + response.data.access_token;
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
 * @returns {Promise<{}>} Promise for the POST request to the authentication endpoint.
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
 * @returns {Promise<{}>} Promise for the POST request to the authentication endpoint.
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
 * @returns {Promise<{}>} Promise for an object containing the repository names.
 */
function collectRepositories() {
    return axiosInstance.get('profile')
        .then(response => {
            if (!('_links' in response.data)) {
                console.error(
                    'Response does not contain _links element. Could not collect entities.');
                process.exit(4);
            }
            
            const entities = {};
            const keys = Object.keys(response.data._links);
            removeElementFromArray(keys, 'self');
            
            for (const key of keys) {
                entities[key] = {'repository': key};
            }
            
            return entities;
        })
        .catch(response => {
            console.error('Collecting entities failed.');
            process.exit(3);
        });
}

/**
 * Retrieves the JSON schema provided by Spring Data REST for each of the entities in the given array.
 *
 * @param entities An array containing objects with the name of each repository provided by Spring Data REST.
 */
async function collectSchemas(entities) {
    console.log('Collecting schemas.');
    
    for (const key in entities) {
        const element = entities[key];
        
        await axiosInstance.get(`profile/${key}`,
                                {headers: {'Accept': 'application/schema+json'}})
            .then(response => {
                element['schema'] = response.data;
            })
            .catch(() => {
                console.error(`Could not collect schema for '${key}'.`);
                process.exit(6);
            });
    }
}

/**
 * Retrieves the ALPS profile provided by Spring Data REST for each of the entities in the given array.
 *
 * @param entities An array containing objects with the name of each repository and schemas provided by Spring Data REST.
 */
async function collectAlpsAndPopulateNames(entities) {
    console.log('Collecting ALPS profiles.');
    
    for (const key in entities) {
        const element = entities[key];
        
        await axiosInstance.get(`profile/${key}`)
            .then(response => {
                element['alps'] = response.data['alps'];
                element['name'] = element['alps']['descriptor'][0]['id'].match(
                    REGEXP_OWN_ENTITY_NAME)[1];
            })
            .catch(() => {
                console.error(`Could not collect ALPS profile for '${key}'.`);
                process.exit(7);
            })
    }
}

/**
 * Pre-Processes schemas according to the given configuration.
 *
 * @param entities An array of objects with repository names, schemas and ALPS profiles.
 * @param config The loaded configuration.
 */
function preProcessSchemas(entities, config) {
    for (const key in entities) {
        if (config.noAdditionalProperties) {
            entities[key].schema.additionalProperties = false;
        }
        if (config.noTrivialTypes) {
            removeTrivialTitles(entities[key].schema.properties || {});
            removeTrivialTitles(entities[key].schema.definitions || {});
        }
    }
}

/**
 * Remove the title properties from object attributes that do not have a $ref property set.
 * This causes json-schema-to-typescript not to generate aliases for trivial types like string, number or boolean.
 *
 * @param object
 */
function removeTrivialTitles(object) {
    for (const key of Object.keys(object)) {
        const property = object[key];
        if (!property['$ref']) {
            delete property.title;
        }
        if (property.properties) {
            removeTrivialTitles(property.properties);
        }
    }
}

/**
 * Post processes TypeScript files.
 * Replaces all references to other types with the respective types.
 *
 * @param entities The list of all entities.
 * @param entity The entity to process.
 * @param renderedClass The rendered TypeScript class.
 * @param modelDir The model directory.
 * @returns {*} The modified class.
 */
function postProcessTypeScriptFiles(entities, entity, renderedClass, modelDir) {
    for (const property of entity['alps']['descriptor'][0]['descriptor']) {
        if ('rt' in property) {
            const propertyName = property['name'];
            let referencedEntity = property['rt'].match(REGEXP_RT_ENTITY_NAME)[0];
            let newPropertyType;
            
            referencedEntity = upperCamelCase(referencedEntity);
            
            if (pluralize.isPlural(propertyName)) {
                newPropertyType = `${referencedEntity}[]`;
            } else {
                newPropertyType = `${referencedEntity}`;
            }
            
            const oldTypeMatches = renderedClass.match(new RegExp('(' + propertyName + STR_APPEND_REGEXP_TYPESCRIPT_PROPERTY_TYPE,
                                                                  'm'));
            const exportRemoved = renderedClass.replace(new RegExp(
                STR_REGEXP_TYPESCRIPT_EXPORT_TYPE.replace('$$@$$',
                                                          oldTypeMatches[2]),
                ''), '');
            const typeReplaced = exportRemoved.replace(new RegExp(escapeRegExp(
                oldTypeMatches[0]), 'g'),
                                                       oldTypeMatches[1] + newPropertyType + oldTypeMatches[3]);
            
            const newImport = `import { ${referencedEntity} } from './${_.kebabCase(
                referencedEntity)}';`;
            
            if (typeReplaced.includes(newImport)) {
                renderedClass = typeReplaced
            } else {
                renderedClass = typeReplaced.replace(STR_IMPORT_REPLACE,
                                                     `${STR_IMPORT_REPLACE}\n${newImport}`);
            }
        }
    }
    
    return renderedClass;
}

/**
 * Generates TypeScript classes in the 'model' directory from the given JSON schemas.
 *
 * @param entities The array of entities, must match the schemas array.
 * @param outputDir The output directory to use. Models are generated in the 'model' subdirectory.
 * @param modelDir The name of the model directory.
 * @param serviceDir The name of the service directory.
 */
async function generateTypeScriptFromSchema(entities, outputDir, modelDir, serviceDir) {
    console.log(`Generating files.`);
    
    const classTemplateString = fs.readFileSync(PATH_CLASS_TEMPLATE).toString();
    const serviceTemplateString = fs.readFileSync(PATH_SERVICE_TEMPLATE).toString();
    const modelsTemplateString = fs.readFileSync(PATH_MODELS_TEMPLATE).toString();
    const servicesTemplateString = fs.readFileSync(PATH_SERVICES_TEMPLATE).toString();
    const modelsTemplateData = {'models': []};
    const servicesTemplateData = {'services': []};
    
    for (const key in entities) {
        const element = entities[key];
        
        // Apply json-schema-to-typescript conversion.
        let interfaceDefinition = await jsonTs.compile(element.schema,
                                                       element.name,
                                                       {bannerComment: null});
        
        // Add I to the beginning of each class name to indicate interface.
        interfaceDefinition = interfaceDefinition.replace(
            REGEXP_TYPESCRIPT_INTERFACE_NAME,
            '$1I$2$3');
        
        // Construct filename for generated interface file.
        let matches = interfaceDefinition.match(REGEXP_TYPESCRIPT_INTERFACE_NAME);
        
        const interfaceName = matches[2];
        const className = interfaceName.substr(1);
        const classNameKebab = _.kebabCase(className);
        
        // Extract the attributes from the interface file
        matches = interfaceDefinition.match(
            REGEXP_TYPESCRIPT_INTERFACE_ATTRIBUTES);
        const classAttributes = matches[1];
        
        // Create class from template file.
        const classTemplateData = {
            'interfaceDefinition': interfaceDefinition,
            'interfaceName': interfaceName,
            'className': className,
            'classAttributes': classAttributes
        };
        const renderedClass = postProcessTypeScriptFiles(entities,
                                                         element,
                                                         mustache.render(
                                                             classTemplateString,
                                                             classTemplateData),
                                                         modelDir);
        const classFileName = `${classNameKebab}.ts`;
        
        fs.writeFileSync(`${outputDir}/${modelDir}/${classFileName}`,
                         renderedClass);
        
        // Create service from template file.
        const serviceTemplateData = {
            'className': className,
            'classNameKebab': classNameKebab,
            'modelDir': modelDir,
            'repositoryName': element
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
    const renderedModel = mustache.render(modelsTemplateString,
                                          modelsTemplateData);
    fs.writeFileSync(`${outputDir}/${modelDir}.ts`, renderedModel);
    const renderedServices = mustache.render(servicesTemplateString,
                                             servicesTemplateData);
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

/**
 * Converts the given string to upper camel case.
 *
 * @param toConvert The string to convert.
 * @returns {string} The string to convert in upper camel case.
 */
function upperCamelCase(toConvert) {
    const inCamelCase = _.camelCase(toConvert);
    
    return inCamelCase.charAt(0).toUpperCase() + inCamelCase.substr(1,
                                                                    inCamelCase.length - 1);
}

/**
 * Escapes the given string to be used in regular expressions.
 *
 * @param string The string to escape.
 * @returns {string|void|*} An escaped string.
 */
function escapeRegExp(string) {
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


module.exports = ngSpringDataRest;
