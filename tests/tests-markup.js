/* global it */
/* global xit */
/* global describe */
/* global beforeEach */

'use strict';
const { exec } = require('child_process'),
      gulp = require('./tests-gulp.js'),
      assert = require('yeoman-assert'),
      del = require('del'),
      fs = require('fs'),
      projectPath = './tests/sample_project',
      nodeModulesPath = `${projectPath}/node_modules`,
      componentMacros = `${projectPath}/components`,
      webroot = `${projectPath}/_site`,
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

function deleteNodeModuleWebroots() {
  return del([`${nodeModulesPath}/library-component-module/_site`, `${nodeModulesPath}/doc-component-module/_site`]);
}


module.exports = function(){
    describe('markup:concatenate:macros:', function(){
      beforeEach(function(){
        return gulp('clean:concatenated-macros');
      });

      it('should concatenate macros', function() {
        return gulp(`markup:concatenate:macros:${configProductName}`)
          .then(result => {
            assert.fileContent(`${componentMacros}/${configProductName}.njk`, '{% macro button(');
            assert.fileContent(`${componentMacros}/${configProductName}.njk`, '{% macro data_table(');
          });
      });

      it('should concatenate all macros into their respective files', function() {
        return gulp('markup:concatenate:macros:all')
          .then(result => {
            assert.fileContent(`${componentMacros}/${configProductName}.njk`, '{% macro button(');
          });
      });

    });

    describe('markup:build:', function(){
      beforeEach(function(){
        return gulp('clean:webroot');
      });

      it('should compile docs', function() {
        return gulp('tokens:build:all')
          .then(result => gulp('markup:concatenate:macros:all'))
          .then(result => gulp(`markup:build:${configProductName}`))
          .then(result => {
            assert.fileContent(`${webroot}/latest/index.html`, '<h1>Doc Site Homepage</h1>');
            assert.fileContent(`${webroot}/latest/index.html`, '<button class="uds-button"');
          });
      });

      it('should compile all docs', function() {
        return gulp('tokens:build:all')
          .then(result => gulp('markup:concatenate:macros:all'))
          .then(result => gulp('markup:build:all'))
          .then(result => {
            assert.file(`${webroot}/latest/index.html`);
          });
      });

      it('should compile using a markdown filter', function() {
        return gulp('tokens:build:all')
          .then(result => gulp('markup:concatenate:macros:all'))
          .then(result => gulp('markup:build:all'))
          .then(result => {
            assert.fileContent(`${webroot}/latest/index.html`, '<h1 id="doc-compiled-from-markdown">Doc Compiled from Markdown</h1>');
          });
      });

      it('should compile docs while referencing a macro from a dependency', function() {
        return gulp('tokens:build:all')
          .then(result => gulp('markup:concatenate:macros:all'))
          .then(result => gulp('markup:build:all'))
          .then(result => {
            assert.fileContent(`${webroot}/latest/index.html`, '<button>I\'m a button from Product A</button>');
          });
      });
    });

    describe('watch:markup:macros', function(){
      it('should reconcatenate macros and rebuild docs when macro files are saved', function(done){
        exec(`gulp watch:markup:macros:${configProductName}`); // start watch
        deleteNodeModuleWebroots();
        gulp('clean:concatenated-macros')
          .then(result => gulp('clean:webroot'))
          .then(result => {
            exec(`touch ${componentMacros}/button/button.njk`);
            recursivelyCheckForFiles([`${componentMacros}/${configProductName}.njk`,
                                      `${webroot}/latest/index.html`], done);
          });
      });

      it('should watch all macro files and trigger correct rebuilds when macro files are saved', function(done){
        exec(`gulp watch:markup:macros:all`); // start watch
        deleteNodeModuleWebroots();
        gulp('clean:concatenated-macros')
          .then(result => gulp('clean:webroot'))
          .then(result => {
            exec(`touch ${componentMacros}/button/button.njk`);
            recursivelyCheckForFiles([`${componentMacros}/${configProductName}.njk`,
                                      `${webroot}/latest/index.html`], done);
          });
      });
    });

    describe('watch:markup:docs', function(){
      it('should rebuild doc files when doc files are saved', function(done){
        exec(`gulp watch:markup:docs:${configProductName}`); // start watch
        gulp('markup:concatenate:macros:all')
          .then(result => gulp('clean:webroot'))
          .then(result => {
            exec(`touch ${projectPath}/docs/index.njk`);
            recursivelyCheckForFiles([`${webroot}/latest/index.html`], done);
          });
      });

      it('should rebuild "doc" files when all doc files are being watched', function(done){
        exec(`gulp watch:markup:docs:all`); // start watch
        deleteNodeModuleWebroots();
        gulp('markup:concatenate:macros:all')
          .then(result => gulp('clean:webroot'))
          .then(result => {
            exec(`touch ${projectPath}/docs/index.njk`);
            recursivelyCheckForFiles([`${webroot}/latest/index.html`], done);
          });
      });
    });
  };
