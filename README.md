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
                           

Angular class and service generator for use with Spring Data REST and 
@lagoshny/ngx-hal-client. Generates files based on the provided JSON schema 
and ALPS profiles. Allows simple modifications of the generated files.

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  -b BASEURL, --base-url BASEURL
                        The base URL to the Spring Data REST server. This 
                        property is required.
  -u USERNAME, --user USERNAME
                        The username to be used when authenticating with the 
                        Spring Data REST server. This property is required, 
                        when authentication is used.
  -p PASSWORD, --password PASSWORD
                        The password to be used when authenticating with the 
                        Spring Data REST server. This property is required, 
                        when authentication is used.
  -a AUTH_METHOD, --auth AUTH_METHOD
                        The authentication method to use. The authentication 
                        method to use, defaults to NONE. Possible values are 
                        "NONE", "COOKIE" and "OAUTH2".
  --auth-endpoint AUTH_ENDPOINT
                        The authentication endpoint URL. When using OAuth2 
                        this is used as token endpoint.
  --oauth-flow OAUTH_FLOW
                        The OAuth2 flow to use when authenticating. Currently 
                        only "PASSWORD" is supported.
  --client CLIENT_NAME  The client name to use for OAuth2 authentication.
  --client-password CLIENT_PASSWORD
                        The client password to use for OAuth2 authentication.
  --no-additional-properties
                        A switch to add "additionalProperties": false to 
                        every JSON schema before it is converted.
  --output-dir OUTPUT_DIR
                        Path of the output directory. If the directory does 
                        not exist, it is created. Defaults to "./gen".
  --model-dir MODEL_DIR
                        Name of the model directory.
  --service-dir SERVICE_DIR
                        Name of the service directory.
```
