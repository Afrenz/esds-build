'use strict';

const config = require('./config.js'),
        gulp = config.getGulpInstance(),
        concat = require('gulp-concat-util'),
        allTaskName = config.get().allTaskName,
        fs = require('fs'),
        path = require('path'),
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
        watchTemplatesTaskPrefix = markupConfig.watchTemplatesTaskPrefix,
        concatTasks = markupTasks.filter(task => task.componentMacros).map(task => `${concatMacrosTaskPrefix}${task.name}`),
        buildTasks = markupTasks.filter(task => task.docSourceFilePaths).map(task => `${buildTaskPrefix}${task.name}`),
        watchDocsTasks = markupTasks.filter(task => task.docSourceFilePaths).map(task => `${watchDocsTaskPrefix}${task.name}`),
        watchTemplatesTasks = markupTasks.filter(task => task.templateSourceFilePaths).map(task => `${watchTemplatesTaskPrefix}${task.name}`),
        watchMacrosTasks = markupTasks.filter(task => task.componentMacros).map(task => `${watchMacrosTaskPrefix}${task.name}`),
        lifecycleHookTaskNames = {
            concatAll: `${concatMacrosTaskPrefix}${allTaskName}`,
            buildAll: `${buildTaskPrefix}${allTaskName}`,
            watchDocs: `${watchDocsTaskPrefix}${allTaskName}`,
            watchMacros: `${watchMacrosTaskPrefix}${allTaskName}`,
            watchTemplates: `${watchTemplatesTaskPrefix}${allTaskName}`,
            watchAll: `${watchTaskPrefix}${allTaskName}`
        },
        lifecycleHookTaskNameKeys = Object.keys(lifecycleHookTaskNames);

function generateBasePreAndPostTasks(taskName) {
    const tasksWithPreAndPostHooks = config.getBaseTaskWithPreAndPostHooks(taskName);
    gulp.task(taskName, gulp.series(tasksWithPreAndPostHooks)); // Calls :base task and pre: and post: tasks if defined
}

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
        const taskName = `${concatMacrosTaskPrefix}${c.name}`;
        gulp.task(config.getBaseTaskName(taskName), function(done){
            if (buildConfig.concatenateComponentMacros) {
            const concatenatedMacroFilename = `${buildConfig.codeNamespace}${buildConfig.markupSourceExtension}`;
                return gulp.src([c.componentMacros, `!${c.componentMacroOutputPath}/${c.componentMacroFilename}`])
                .pipe(concat(concatenatedMacroFilename))
                .pipe(concat.header('{# DO NOT EDIT: This file is automatically generated by the project\'s build task #}\n'))
                .pipe(gulp.dest(c.componentMacroOutputPath));

            } else {
                console.log('concatenateComponentMacros is false, skipping component macro concatenation');
                done();
            }
        });

        generateBasePreAndPostTasks(taskName);
    }
}

function generateWatchMacrosTask(c) {
    if (c.componentMacros) {
        const taskName = `${watchMacrosTaskPrefix}${c.name}`;
        gulp.task(config.getBaseTaskName(taskName), function(){
            const concatTask = `${concatMacrosTaskPrefix}${c.name}`,
                    concatenatedMacroFilename = `${c.componentMacroOutputPath}/${c.componentMacroFilename}`,
                    macroLibraryHasDocs = c.docSourceFilePaths,
                    macroLibraryIsReferenced = c.componentsReferencedBy;

            let postConcatBuildTasks = [];

            if (macroLibraryIsReferenced) {
                let referencedBuildTasks = c.componentsReferencedBy.map(taskName => `${markupConfig.buildTaskPrefix}${taskName}:allDocs`); // Make sure to rebuild ALL docs when a macro is changed since we don't know what docs will be consuming a macro
                postConcatBuildTasks = postConcatBuildTasks.concat(referencedBuildTasks);
            }

            if (macroLibraryHasDocs) {
                let macroLibraryBuildTask = `${markupConfig.buildTaskPrefix}${c.name}:allDocs`; // Make sure to rebuild ALL docs when a macro is changed since we don't know what docs will be consuming a macro
                postConcatBuildTasks.push(macroLibraryBuildTask);
            }

            return gulp.watch([c.componentMacros, `!${concatenatedMacroFilename}`], gulp.series(concatTask, gulp.parallel(postConcatBuildTasks)));
        });

        generateBasePreAndPostTasks(taskName);
    }
}

function generateWatchDocsTask(c) {
    if (c.docSourceFilePaths) {
        const taskName = `${watchDocsTaskPrefix}${c.name}`;
        gulp.task(config.getBaseTaskName(taskName), function(){
            return gulp.watch(c.docTemplateWatchPaths, gulp.series(`${buildTaskPrefix}${c.name}`));
        });

        generateBasePreAndPostTasks(taskName);
    }
}

function generateWatchTemplatesTask(c) {
    if (c.templateSourceFilePaths) {
        const taskName = `${watchTemplatesTaskPrefix}${c.name}`;
        gulp.task(config.getBaseTaskName(taskName), function(){
            return gulp.watch([c.templateSourceFilePaths], gulp.series(`${buildTaskPrefix}${c.name}:allDocs`));
        });

        generateBasePreAndPostTasks(taskName);
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

function compileDocs(nunjucksOptions, t, latestOnly = true) {
    // This method compiles /docs/*.njk files into .html
    const taskName = `${buildTaskPrefix}${t.name}`;
    const filePathsFilter = latestOnly ? { since: gulp.lastRun(config.getBaseTaskName(taskName)) } : {}; // The since parameter filters the incoming files so only the most recently saved file gets recompiled
    return gulp.src(t.docSourceFilePaths, filePathsFilter)
        .pipe(nunjucksData(getDataForTemplates)) // Using the 'gulp-data' plugin to live fetch any data changes each time markup is rebuilt
        .pipe(
            nunjucksRender(nunjucksOptions).on('error', function(e){
                gutil.log(e);
                gutil.beep();
                this.emit('end');
            })
        )
        .pipe(gulp.dest(t.docOutputPath));
}

function getNunjucksOptions(t) {
    return {
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
}

function generateBuildTask(t) {
    if (t.docSourceFilePaths) {
        const taskName = `${buildTaskPrefix}${t.name}`;
        const taskNameAllDocs = `${buildTaskPrefix}${t.name}:allDocs`;
        const nunjucksOptions = getNunjucksOptions(t);

        // These two tasks both compile .njk files in the /docs folder
        gulp.task(config.getBaseTaskName(taskName), () => { return compileDocs(nunjucksOptions, t, true); }); // This task only compiles /docs/*.njk files that have been updated since the last time this task ran
        gulp.task(config.getBaseTaskName(taskNameAllDocs), () => { return compileDocs(nunjucksOptions, t, false); }); // This task compiles ALL the /docs/*.njk files, and is triggered when a macro or template file changes since we don't know what /docs/*.njk files will be affected by those changes

        generateBasePreAndPostTasks(taskName);
        generateBasePreAndPostTasks(taskNameAllDocs);
    }
}

markupTasks.forEach(function(c){
    generateMacroConcatenateTask(c);
    generateBuildTask(c);
    generateWatchMacrosTask(c);
    generateWatchDocsTask(c);
    generateWatchTemplatesTask(c);
});

gulp.task(config.getBaseTaskName(lifecycleHookTaskNames.concatAll), gulp.parallel(concatTasks));

// Build all doc files
gulp.task(config.getBaseTaskName(lifecycleHookTaskNames.buildAll), gulp.parallel(buildTasks));

// Watch all macro files
gulp.task(config.getBaseTaskName(lifecycleHookTaskNames.watchMacros), gulp.parallel(watchMacrosTasks));

// Watch all template files
gulp.task(config.getBaseTaskName(lifecycleHookTaskNames.watchTemplates), gulp.parallel(watchTemplatesTasks));

// Watch all doc files
gulp.task(config.getBaseTaskName(lifecycleHookTaskNames.watchDocs), gulp.parallel(watchDocsTasks));

// Watch all .njk files
gulp.task(config.getBaseTaskName(lifecycleHookTaskNames.watchAll), gulp.parallel(config.getBaseTaskName(lifecycleHookTaskNames.watchMacros), config.getBaseTaskName(lifecycleHookTaskNames.watchTemplates), config.getBaseTaskName(lifecycleHookTaskNames.watchDocs)));

// Generate lifecycle hook (pre & post) tasks (if defined)
lifecycleHookTaskNameKeys.forEach((k) => {
    const t = lifecycleHookTaskNames[k],
            tasksWithPreAndPostHooks = config.getBaseTaskWithPreAndPostHooks(t);

    gulp.task(t, gulp.series(tasksWithPreAndPostHooks));
});
