"use strict";

/* eslint no-use-before-define: 0 */

const path = require("path");

const _ = require("lodash");
const BbPromise = require("bluebird");

module.exports = {
  compileFunctions() {
    const artifactFilePath = this.serverless.service.package.artifact;
    const fileName = artifactFilePath.split(path.sep).pop();

    this.serverless.service.package.artifactFilePath = `${this.serverless.service.package.artifactDirectoryName}/${fileName}`;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const funcObject = this.serverless.service.getFunction(functionName);

      this.serverless.cli.log(`Compiling function "${functionName}"...`);

      funcObject.prependStage = _.get(
        funcObject,
        "prependStage",
        this.options.prependStage
      );
      funcObject.prependService = _.get(
        funcObject,
        "prependService",
        this.options.prependService
      );
      funcObject.prefix = _.get(funcObject, "prefix", this.options.prefix);

      validateHandlerProperty(funcObject, functionName);
      validateEventsProperty(funcObject, functionName);
      let funcTemplate = getFunctionTemplate(
        funcObject,
        _.get(this, "serverless.service.provider.region", this.options.region),
        this.options.stage,
        this.serverless.service.service,
        this.serverless.service.provider.project,
        `gs://${this.serverless.service.provider.deploymentBucketName}/${this.serverless.service.package.artifactFilePath}`
      );

      const accessControlTemplate = getAccessControlTemplate();

      const eventType = Object.keys(funcObject.events[0])[0];

      funcTemplate.properties.availableMemoryMb =
        _.get(funcObject, "memorySize") ||
        _.get(this, "serverless.service.provider.memorySize") ||
        256;
      funcTemplate.properties.runtime =
        _.get(funcObject, "runtime") ||
        _.get(this, "serverless.service.provider.runtime") ||
        "nodejs8";
      funcTemplate.properties.timeout =
        _.get(funcObject, "timeout") ||
        _.get(this, "serverless.service.provider.timeout") ||
        "60s";
      funcTemplate.properties.serviceAccountEmail =
        _.get(funcObject, "serviceAccount") ||
        _.get(this, "serverless.service.provider.serviceAccount") ||
        "";
      funcTemplate.properties.vpcConnector =
        _.get(funcObject, "vpcConnector") || "";

      if (
        funcTemplate.properties.vpcConnector &&
        funcTemplate.properties.vpcConnector.length > 0
      ) {
        funcTemplate.properties.vpcConnectorEgressSettings =
          _.get(funcObject, "vpcConnectorEgressSettings") || "ALL_TRAFFIC";
      }

      if (
        eventType == "http" &&
        _.get(funcObject, "unauthenticatedAccess") == true
      ) {
        accessControlTemplate.accessControl.gcpIamPolicy.bindings.push({
          role: "roles/cloudfunctions.invoker",
          members: ["allUsers"],
        });
      }

      funcTemplate.properties.labels = _.assign(
        {},
        _.get(this, "serverless.service.provider.labels") || {},
        _.get(funcObject, "labels") || {}
      );
      funcTemplate.properties.environmentVariables = _.merge(
        _.get(this, "serverless.service.provider.environment"),
        funcObject.environment
      );

      if (!funcTemplate.properties.serviceAccountEmail) {
        delete funcTemplate.properties.serviceAccountEmail;
      }

      if (!funcTemplate.properties.vpcConnector) {
        delete funcTemplate.properties.vpcConnector;
      }

      if (!funcTemplate.properties.vpcConnectorEgressSettings) {
        delete funcTemplate.properties.vpcConnectorEgressSettings;
      }

      if (!_.size(funcTemplate.properties.environmentVariables)) {
        delete funcTemplate.properties.environmentVariables;
      }

      if (eventType === "http") {
        const url = funcObject.events[0].http;

        funcTemplate.properties.httpsTrigger = {};
        funcTemplate.properties.httpsTrigger.url = url;
      }
      if (eventType === "event") {
        const type = funcObject.events[0].event.eventType;
        const path = funcObject.events[0].event.path; //eslint-disable-line
        const resource = funcObject.events[0].event.resource;
        const retry = funcObject.events[0].event.retry;

        funcTemplate.properties.eventTrigger = {};
        funcTemplate.properties.eventTrigger.eventType = type;
        if (path) funcTemplate.properties.eventTrigger.path = path;
        if (retry)
          funcTemplate.properties.eventTrigger.failurePolicy = { retry: {} };
        funcTemplate.properties.eventTrigger.resource = resource;
      }

      if (
        accessControlTemplate.accessControl.gcpIamPolicy.bindings.length > 0
      ) {
        funcTemplate = _.assign({}, funcTemplate, accessControlTemplate);
      }

      this.serverless.service.provider.compiledConfigurationTemplate.resources.push(
        funcTemplate
      );
    });

    return BbPromise.resolve();
  },
};

const validateHandlerProperty = (funcObject, functionName) => {
  if (!funcObject.handler) {
    const errorMessage = [
      `Missing "handler" property for function "${functionName}".`,
      ' Your function needs a "handler".',
      " Please check the docs for more info.",
    ].join("");
    throw new Error(errorMessage);
  }
};

const validateEventsProperty = (funcObject, functionName) => {
  if (!funcObject.events || funcObject.events.length === 0) {
    const errorMessage = [
      `Missing "events" property for function "${functionName}".`,
      ' Your function needs at least one "event".',
      " Please check the docs for more info.",
    ].join("");
    throw new Error(errorMessage);
  }

  if (funcObject.events.length > 1) {
    const errorMessage = [
      `The function "${functionName}" has more than one event.`,
      " Only one event per function is supported.",
      " Please check the docs for more info.",
    ].join("");
    throw new Error(errorMessage);
  }

  const supportedEvents = ["http", "event"];
  const eventType = Object.keys(funcObject.events[0])[0];
  if (supportedEvents.indexOf(eventType) === -1) {
    const errorMessage = [
      `Event type "${eventType}" of function "${functionName}" not supported.`,
      ` supported event types are: ${supportedEvents.join(", ")}`,
    ].join("");
    throw new Error(errorMessage);
  }
};

const getFunctionTemplate = (
  funcObject,
  region,
  stage,
  service,
  project,
  sourceArchiveUrl
) => {
  //eslint-disable-line
  let funcName = funcObject.handler;

  if (funcObject.prependStage) {
    funcName = `${stage}-${funcName}`;
  }

  if (funcObject.prependService) {
    funcName = `${service}-${funcName}`;
  }

  if (funcObject.prefix && funcObject.prefix !== "") {
    funcName = `${funcObject.prefix}-${funcName}`;
  }

  return {
    type: "gcp-types/cloudfunctions-v1:projects.locations.functions",
    name: funcObject.name,
    properties: {
      parent: `projects/${project}/locations/${region}`,
      availableMemoryMb: 256,
      runtime: "nodejs8",
      timeout: "60s",
      entryPoint: funcObject.handler,
      function: funcName,
      sourceArchiveUrl,
    },
  };
};

const getAccessControlTemplate = () => {
  return {
    accessControl: {
      gcpIamPolicy: {
        bindings: [],
      },
    },
  };
};
