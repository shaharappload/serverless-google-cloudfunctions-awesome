'use strict';

const setDefaults = require('./utils');
const GoogleProvider = require('../provider/googleProvider');
const Serverless = require('../test/serverless');
const GoogleCommand = require('../test/googleCommand');

describe('Utils', () => {
  let serverless;
  let googleCommand;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('google', new GoogleProvider(serverless));
    googleCommand = new GoogleCommand(serverless, {}, setDefaults);
  });

  describe('#setDefaults()', () => {
    it('should set default values for options if not provided', () => googleCommand
      .setDefaults().then(() => {
        expect(googleCommand.options.stage).toEqual('dev');
        expect(googleCommand.options.region).toEqual('us-central1');
        expect(googleCommand.options.prependStage).toEqual(false);
        expect(googleCommand.options.prependService).toEqual(false);
      }));

    it('should set the options when they are provided', () => {
      googleCommand.options.stage = 'my-stage';
      googleCommand.options.region = 'my-region';
      googleCommand.serverless.service = {
        provider: {
          prependStage: true,
          prependService: true,
        },
      };

      return googleCommand.setDefaults().then(() => {
        expect(googleCommand.options.stage).toEqual('my-stage');
        expect(googleCommand.options.region).toEqual('my-region');
        expect(googleCommand.options.prependStage).toEqual(true);
        expect(googleCommand.options.prependService).toEqual(true);
      });
    });

    it('should prioritize options over provider options, even if booleans as strings', () => {
      googleCommand.options.stage = 'my-stage';
      googleCommand.options.region = 'my-region';
      googleCommand.options.prependStage = 'false';
      googleCommand.options.prependService = 'true';
      googleCommand.serverless.service = {
        provider: {
          prependStage: true,
          prependService: false,
        },
      };

      return googleCommand.setDefaults().then(() => {
        expect(googleCommand.options.stage).toEqual('my-stage');
        expect(googleCommand.options.region).toEqual('my-region');
        expect(googleCommand.options.prependStage).toEqual(false);
        expect(googleCommand.options.prependService).toEqual(true);
      });
    });

    it('should prioritize options over provider options', () => {
      googleCommand.options.stage = 'my-stage';
      googleCommand.options.region = 'my-region';
      googleCommand.options.prependStage = false;
      googleCommand.options.prependService = false;
      googleCommand.serverless.service = {
        provider: {
          prependStage: true,
          prependService: true,
        },
      };

      return googleCommand.setDefaults().then(() => {
        expect(googleCommand.options.stage).toEqual('my-stage');
        expect(googleCommand.options.region).toEqual('my-region');
        expect(googleCommand.options.prependStage).toEqual(false);
        expect(googleCommand.options.prependService).toEqual(false);
      });
    });
  });
});
