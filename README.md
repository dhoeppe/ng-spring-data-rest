# ng-spring-data-rest
ng-spring-data-rest connects to the specified host providing repository endpoints
by Spring Data REST and converts them to TypeScript classes and services to be used
in Angular projects.

The generated services utilize @lagoshny/ngx-hal-client.

## Usage
```
usage: ng-spring-data-rest [-h] [-v] -b BASEURL [-u USERNAME] [-p PASSWORD]
                           [-a AUTH_METHOD] [--auth-endpoint AUTH_ENDPOINT]
                           [--oauth-flow OAUTH_FLOW] [--client CLIENT_NAME]
                           [--client-password CLIENT_PASSWORD]
                           [--no-additional-properties]
                           [--output-dir OUTPUT_DIR] [--model-dir MODEL_DIR]
                           [--service-dir SERVICE_DIR]
                           

Angular class and service generator for use with Spring Data REST and the 
ngx-hal-client. Generates classes based on the provided JSON schema and ALPS 
profiles. Allows simple modifications of the generated files.

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  -b BASEURL, --base-url BASEURL
                        The base URL to the Spring Data REST server.
  -u USERNAME, --user USERNAME
                        The username to be used when authenticating with the 
                        Spring Data REST server.
  -p PASSWORD, --password PASSWORD
                        The password to be used when authenticating with the 
                        Spring Data REST server.
  -a AUTH_METHOD, --auth AUTH_METHOD
                        The authentication method to use. When using COOKIE 
                        the body to the authentication endpoint contains a 
                        JSON object with the properties 'username' and 
                        'password' with the specified credentials. OAuth2 
                        does not support scopes.
  --auth-endpoint AUTH_ENDPOINT
                        The authentication endpoint URL.
  --oauth-flow OAUTH_FLOW
                        The OAuth2 flow to use when authenticating.
  --client CLIENT_NAME  The client name to use for OAuth2 authentication.
  --client-password CLIENT_PASSWORD
                        The client password to use for OAuth2 authentication.
  --no-additional-properties
                        A switch to add "additionalProperties": false to 
                        every JSON schema before it is converted.
  --output-dir OUTPUT_DIR
                        Path the the output directory. If the directory does 
                        not exist, it is created. If not specified, a new 
                        folder "gen" is created in the current working 
                        directory and used as output.
  --model-dir MODEL_DIR
                        Name of the model directory.
  --service-dir SERVICE_DIR
                        Name of the service directory.
```
