'use strict';

const config = require('./config.js'),
        concat = require('gulp-concat-util'),
        fs = require('fs'),
        path = require('path'),
        gulp = require('gulp'),
        gutil = require('gulp-util'),
        marked = require('marked'),
        stripIndent = require('strip-indent'),
        buildConfig = config.get(),
        markupConfig = buildConfig.markup,
        markupTasks = markupConfig.tasks,
        nunjucksRender = require('gulp-nunjucks-render'),
        nunjucksData = require('gulp-data'),
        concatMacrosTaskPrefix = markupConfig.concatMacrosTaskPrefix,
        buildTaskPrefix = markupConfig.buildTaskPrefix,
        watchTaskPrefix = markupConfig.watchTaskPrefix,
        watchDocsTaskPrefix = markupConfig.watchDocsTaskPrefix,
        watchMacrosTaskPrefix = markupConfig.watchMacrosTaskPrefix,
        concatTasks = markupTasks.filter(task => task.componentMacros).map(task => `${concatMacrosTaskPrefix}${task.name}`),
        buildTasks = markupTasks.filter(task => task.docSourceFilePaths).map(task => `${buildTaskPrefix}${task.name}`),
        watchDocsTasks = markupTasks.filter(task => task.docSourceFilePaths).map(task => `${watchDocsTaskPrefix}${task.name}`),
        watchMacrosTasks = markupTasks.filter(task => task.componentMacros).map(task => `${watchMacrosTaskPrefix}${task.name}`);

function addDocLibraryNunjucksFilters(env) {
    env.addFilter('markdown', function(string, includeWrapper, wrapperClass) {
        var renderedMarkup = marked(stripIndent(string)),
            configWrapperClass = buildConfig.markdownWrapperClass,
            configIncludeMarkdownWrapper = buildConfig.includeMarkdownWrapper;

        // If includeWrapper is set when the filter is called, use that value, otherwise use config defaults
        includeWrapper = typeof includeWrapper === 'undefined' ? configIncludeMarkdownWrapper : includeWrapper;

        // If a wrapperClass is set when the filter is called, use that value, otherwise use config defaults
        wrapperClass = typeof wrapperClass === 'undefined' ? configWrapperClass : wrapperClass;

        if (includeWrapper) {
            renderedMarkup = '<div class="' + wrapperClass + '">' + renderedMarkup + "</div>";
        }

        return env.filters.safe(renderedMarkup);
    });
}

function generateMacroConcatenateTask(c) {
    if (c.componentMacros) {
        gulp.task(`${concatMacrosTaskPrefix}${c.name}`, function(){
            const concatenatedMacroFilename = `${buildConfig.codeNamespace}${buildConfig.markupSourceExtension}`;
            return gulp.src([c.componentMacros, `!${c.componentMacroOutputPath}/${c.componentMacroFilename}`])
                .pipe(concat(concatenatedMacroFilename))
                .pipe(concat.header('{# DO NOT EDIT: This file is automatically generated by the project\'s build task #}\n'))
                .pipe(gulp.dest(c.componentMacroOutputPath));
        });
    }
}

function generateWatchMacrosTask(c) {
    if (c.componentMacros) {
        gulp.task(`${watchMacrosTaskPrefix}${c.name}`, function(){
            const concatTask = `${concatMacrosTaskPrefix}${c.name}`,
                    concatenatedMacroFilename = `${c.componentMacroOutputPath}/${c.componentMacroFilename}`,
                    macroLibraryHasDocs = c.docSourceFilePaths,
                    macroLibraryIsReferenced = c.componentsReferencedBy;

            let postConcatBuildTasks = [];

            if (macroLibraryIsReferenced) {
                let referencedBuildTasks = c.componentsReferencedBy.map(taskName => `${markupConfig.buildTaskPrefix}${taskName}`);
                postConcatBuildTasks = postConcatBuildTasks.concat(referencedBuildTasks);
            }

            if (macroLibraryHasDocs) {
                let macroLibraryBuildTask = `${markupConfig.buildTaskPrefix}${c.name}`;
                postConcatBuildTasks.push(macroLibraryBuildTask);
            }

            return gulp.watch([c.componentMacros, `!${concatenatedMacroFilename}`], gulp.series(concatTask, gulp.parallel(postConcatBuildTasks)));
        });
    }
}

function generateWatchDocsTask(c) {
    if (c.docSourceFilePaths) {
        gulp.task(`${watchDocsTaskPrefix}${c.name}`, function(){
            return gulp.watch(c.docTemplateWatchPaths, gulp.series(`${buildTaskPrefix}${c.name}`));
        });
    }
}

function getDataForTemplates() {
    const fullDataPath = path.join(buildConfig.rootPath, buildConfig.dataPath),
            tokensPath = path.join(buildConfig.rootPath, buildConfig.tokensPath),
            packageJsonPath = path.join(buildConfig.rootPath, 'package.json');

    let allDataFiles = [],
        tokenDataFiles = [], // Separating these because they already contain a namespace at the top level
        data = {};

    // package.json
    if (fs.existsSync(packageJsonPath)) {
        let contents = fs.readFileSync(packageJsonPath, {encoding: 'UTF-8'}),
            json;

        try {
            json = JSON.parse(contents);
            data.package = json;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(e, `Warning: Could not parse package.json file: ${packageJsonPath} into JSON for nunjucks`);
        }
    }

    if (fs.existsSync(tokensPath)) {
        const fullTokensPath = path.join(buildConfig.rootPath, buildConfig.tokensPath);
        tokenDataFiles = tokenDataFiles.concat(fs.readdirSync(tokensPath)
                                                .filter(f => f.indexOf('.json') !== -1)
                                                .map(f => path.join(fullTokensPath, f)));
    }
    // Get reference tokens.json files from child modules
    if (buildConfig.dependencies) {
        const referenceTokenDependencies = buildConfig.dependencies;
        referenceTokenDependencies.forEach(d => {
            const referenceTokenPath = path.join(buildConfig.rootPath, buildConfig.dependenciesPath, d.moduleName, buildConfig.tokensPath, 'tokens.json'); // Assumes the child module's tokens exist at /tokens/tokens.json
            tokenDataFiles.push(referenceTokenPath);
        });
    }
    tokenDataFiles.forEach(f => {
        if (fs.existsSync(f)) {
            let contents = fs.readFileSync(f, {encoding: 'UTF-8'}),
                json;
            try {
                json = JSON.parse(contents);
                Object.assign(data, json);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log(e, `Warning: Could not parse tokens file ${f} into JSON for nunjucks`);
            }
        }
    });


    if (fs.existsSync(fullDataPath)) {
        allDataFiles = allDataFiles.concat(fs.readdirSync(fullDataPath).filter(f => f.indexOf('.json') !== -1));
    }
    allDataFiles.forEach(f => {
        let namespace = f.replace(/.json/, ''),
            fullFilepath = path.join(buildConfig.rootPath, buildConfig.dataPath, f);
        if (fs.existsSync(fullFilepath)) {
            let contents = fs.readFileSync(fullFilepath, {encoding: 'UTF-8'}),
                json;

            try {
                json = JSON.parse(contents);
                data[namespace] = json;
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log(e, `Warning: Could not parse data file ${fullFilepath} into JSON for nunjucks`);
            }
        }
    });

    return data;
}

function generateBuildTask(t) {
    if (t.docSourceFilePaths) {
        let nunjucksOptions = {
            envOptions: {
                watch: false
            },
            manageEnv: function(env) {
                addDocLibraryNunjucksFilters(env);
                if (buildConfig.manageNunjucksEnv) {
                    buildConfig.manageNunjucksEnv(env);
                }

                // Loop over all dependencies, if a dependency defines a "manageNunjucksEnv" function, run it here too
                if (buildConfig.dependencies) {
                    buildConfig.dependencies.forEach(d => {
                        const dependencyConfig = config.getDependencyConfig(d.moduleName, buildConfig.rootPath);
                        if (dependencyConfig.manageNunjucksEnv) {
                            dependencyConfig.manageNunjucksEnv(env);
                        }
                    });
                }
            },
            path: t.docTemplateImportPaths
        };

        // Compile doc src to html
        gulp.task(`${buildTaskPrefix}${t.name}`, function() {
            return gulp.src(t.docSourceFilePaths)
                .pipe(nunjucksData(getDataForTemplates)) // Using the 'gulp-data' plugin to live fetch any data changes each time markup is rebuilt
                .pipe(
                    nunjucksRender(nunjucksOptions).on('error', function(e){
                        gutil.log(e);
                        gutil.beep();
                        this.emit('end');
                    })
                )
                .pipe(gulp.dest(t.docOutputPath));
        });
    }
}

markupTasks.forEach(function(c){
    generateMacroConcatenateTask(c);
    generateBuildTask(c);
    generateWatchMacrosTask(c);
    generateWatchDocsTask(c);
});

// Concatenate all macro files
gulp.task(`${concatMacrosTaskPrefix}all`, gulp.parallel(concatTasks));

// Build all doc files
gulp.task(`${buildTaskPrefix}all`, gulp.parallel(buildTasks));

// Watch all macro files
gulp.task(`${watchMacrosTaskPrefix}all`, gulp.parallel(watchMacrosTasks));

// Watch all doc files
gulp.task(`${watchDocsTaskPrefix}all`, gulp.parallel(watchDocsTasks));

gulp.task(`${watchTaskPrefix}all`, gulp.parallel(`${watchMacrosTaskPrefix}all`, `${watchDocsTaskPrefix}all`));

