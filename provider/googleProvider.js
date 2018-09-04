'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const BbPromise = require('bluebird');
const _ = require('lodash');
const google = require('googleapis');

const constants = {
  providerName: 'google',
};

class GoogleProvider {
  static getProviderName() {
    return constants.providerName;
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this; // only load plugin in a Google service context
    this.serverless.setProvider(constants.providerName, this);

    this.sdk = {
      deploymentmanager: google.deploymentmanager('v2'),
      storage: google.storage('v1'),
      logging: google.logging('v2'),
      cloudfunctions: google.cloudfunctions('v1'),
    };
  }

  request() {
    // grab necessary stuff from arguments array
    const lastArg = arguments[Object.keys(arguments).pop()]; //eslint-disable-line
    const hasParams = (typeof lastArg === 'object');
    const filArgs = _.filter(arguments, v => typeof v === 'string'); //eslint-disable-line
    const params = hasParams ? lastArg : {};

    return new BbPromise((resolve, reject) => {
      const service = filArgs[0];
      this.isServiceSupported(service);

      const authClient = this.getAuthClient();

      authClient.authorize(() => {
        const requestParams = { auth: authClient };

        // merge the params from the request call into the base functionParams
        _.merge(requestParams, params);

        // support for API calls with arbitrary deepness
        filArgs.reduce((p, c) => p[c], this.sdk)(requestParams, (error, response) => {
          if (error && error.errors && error.errors[0].message && error.errors[0].message.includes('project 1043443644444')) {
            reject(new Error("Incorrect configuration. Please change the 'project' key in the 'provider' block in your Serverless config file."));
          } else if (error) {
            reject(new Error(error));
          }
          return resolve(response);
        });
      });
    });
  }

  getAuthClient() {
    let credentials = this.serverless.service.provider.credentials;
    let key;

    if (_.isPlainObject(credentials)) {
      key = credentials;
    } else {
      const credParts = credentials.split(path.sep);

      if (credParts[0] === '~') {
        credParts[0] = os.homedir();
        credentials = credParts.reduce((memo, part) => path.join(memo, part), '');
      }

      const keyFileContent = fs.readFileSync(credentials).toString();
      key = JSON.parse(keyFileContent);
    }

    return new google.auth
      .JWT(key.client_email, null, key.private_key, ['https://www.googleapis.com/auth/cloud-platform'], null);
  }

  isServiceSupported(service) {
    if (!Object.keys(this.sdk).includes(service)) {
      const errorMessage = [
        `Unsupported service API "${service}".`,
        ` Supported service APIs are: ${Object.keys(this.sdk).join(', ')}`,
      ].join('');

      throw new Error(errorMessage);
    }
  }
}

module.exports = GoogleProvider;
