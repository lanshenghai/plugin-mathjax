var Q = require('q');
var fs = require('fs');
var path = require('path');
var crc = require('crc');
var exec = require('child_process').exec;
var mjAPI = require('mathjax-node/lib/mj-single.js');

var started = false;
var countMath = 0;
var cache = {};

/**
    Prepare MathJaX
*/
function prepareMathJax() {
    if (started) {
        return;
    }

    mjAPI.config({
        MathJax: {
            SVG: {
                font: 'TeX'
            }
        }
    });
    mjAPI.start();

    started = true;
}

/**
    Convert a tex formula into a SVG text

    @param {String} tex
    @param {Object} options
    @return {Promise<String>}
*/
function convertTexToSvg(tex, options) {
    var d = Q.defer();
    options = options || {};

    prepareMathJax();

    mjAPI.typeset({
        math:           tex,
        format:         (options.inline ? 'inline-TeX' : 'TeX'),
        svg:            true,
        speakText:      true,
        speakRuleset:   'mathspeak',
        speakStyle:     'default',
        ex:             6,
        width:          100,
        linebreaks:     true
    }, function (data) {
        if (data.errors) {
            return d.reject(new Error(data.errors));
        }

        d.resolve(options.write? null : data.svg);
    });

    return d.promise;
}

function processTex(book, tex, isInline) {
    // For website return as script
    var config = book.config.get('pluginsConfig.mathjax', {});

    if ((book.output.name == "website" || book.output.name == "json")
        && !config.forceSVG) {
        return '<script type="math/tex; '+(isInline? "": "mode=display")+'">'+tex+'</script>';
    }

    // Check if not already cached
    var hashTex = crc.crc32(tex).toString(16);

    // Return
    var imgFilename = '_mathjax_' + hashTex + '.svg';
    var img = '<img src="/' + imgFilename + '" />';

    // Center math block
    if (!isInline) {
        img = '<div style="text-align:center;margin: 1em 0em;width: 100%;">' + img + '</div>';
    }

    return {
        body: img,
        post: function() {
            if (cache[hashTex]) {
                return;
            }

            cache[hashTex] = true;
            countMath = countMath + 1;

            return convertTexToSvg(tex, { inline: isInline })
            .then(function(svg) {
                return book.output.writeFile(imgFilename, svg);
            });
        }
    };
}

var blockRegex = /(?<!\\)\$\$((.*[\r\n]*)+?)\$\$/m;
var inlineRegex = /(?<!\\)\$(.+?)\$/;
var quotaRegex = /(?<!\\)`.+?`/m;

function processRegReplace(book, content, regex, isInline) {
    var match;
    while (match = regex.exec(content)) {
        var rawBlock = match[0];
        var texBlock = match[1];
        var start = match.index;
        var end = match.index + rawBlock.length;
        var texContent = processTex(book, texBlock, isInline);
        content = content.substring(0, start) + '<span>' + texContent + '</span>' + content.substring(end);
    }
    return content;
}

function processMathTexList(page) {
    var new_content = "";
    var start_pos = 0;

    // skip quota
    while (match = quotaRegex.exec(page.content.substring(start_pos))) {
      var temp = page.content.substring(start_pos, match.index);
      temp = processRegReplace(this, temp, blockRegex, false);
      new_content += processRegReplace(this, temp, inlineRegex, true);
      new_content += match[0];
      start_pos += match.index + match[0].length;
    }
    // for last part or no match
    var temp = page.content.substring(start_pos);
    temp = processRegReplace(this, temp, blockRegex, false);
    new_content += processRegReplace(this, temp, inlineRegex, true);

    page.content = new_content;
    return page;
}
/**
    Return assets for website

    @return {Object}
*/
function getWebsiteAssets() {
    return {
        assets: "./book",
        js: [
            'MathJax.js?config=TeX-AMS-MML_HTMLorMML',
            'plugin.js'
        ]
    };
}

module.exports = {
    website: getWebsiteAssets,
    hooks: {
        'page:before': processMathTexList
    }
};
