'use strict';
const path = require('path');

module.exports = {
    rootPath: path.join(process.cwd(), 'tests', 'sample_project'),
    classPrefix: 'uds-testing',
    docsPath: 'pages',
    markupSourceExtension: '.nunjucks'
};
