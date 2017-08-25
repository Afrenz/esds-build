/* global it */
/* global xit */
/* global describe */
/* global beforeEach */

'use strict';
const { exec } = require('child_process'),
      gulp = require('./tests-gulp.js'),
      tokensTasks = require('../tasks/tokens.js'),
      assert = require('yeoman-assert'),
      fs = require('fs'),
      configProductName = 'eightshapes-uds-build-tools';

// TODO Move this function to a commonly shared place
function recursivelyCheckForFiles(filePaths, done) {
  let allFilesFound = filePaths.every(file => fs.existsSync(file));

  if (allFilesFound) {
    done();
  } else {
    setTimeout(function() {
      recursivelyCheckForFiles(filePaths, done);
    }, 20);
  }
}

module.exports = function(){
    const projectPath = './tests/sample_project',
          tokensPath = `${projectPath}/tokens`,
          tokensScss = `${tokensPath}/tokens.scss`,
          tokensJson = `${tokensPath}/tokens.json`;

    describe('tokens:build', function(){
      beforeEach(function() {
        return gulp('clean:tokens');
      });

      it('should convert tokens.yaml to scss and json and include classPrefix from config', function() {
        return gulp('tokens:build:all')
          .then(result => {
            assert.fileContent(tokensScss, `$${configProductName}-color-interactive-primary: #0ff`);
            assert.fileContent(tokensScss, `$eightshapes-uds-build-tools-class-prefix: "${configProductName}"`);
            assert.fileContent(tokensJson, '"tokens": {');
            assert.fileContent(tokensJson, `"class-prefix": "${configProductName}"`);
            assert.fileContent(tokensJson, '"primary": "#0ff"');
          });
      });

      it('should return a warning when the tokens.yaml source file does not exist', function(){
        tokensTasks.convertTokensYaml('/path/does/not/exist', function(){});
        assert.noFile(`${tokensPath}/tokens.json`);
        assert.noFile(`${tokensPath}/tokens.scss`);
      });
    });

    describe('watch:tokens', function(){
      it('should watch tokens.yaml for changes and rebuild scss and json', function(done){
        exec(`gulp watch:tokens:all`); // start watch
        gulp('clean:tokens') // clear webroot
          .then(result => {
            exec(`touch ${tokensPath}/tokens.yaml`);
            recursivelyCheckForFiles([
              `${tokensPath}/tokens.json`,
              `${tokensPath}/tokens.scss`], done);
          });
      });
    });
};
