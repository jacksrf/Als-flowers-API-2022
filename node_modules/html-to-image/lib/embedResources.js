"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embed = exports.parseURLs = exports.embedResources = exports.shouldEmbed = void 0;
var getBlobFromURL_1 = require("./getBlobFromURL");
var util_1 = require("./util");
var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g;
function shouldEmbed(string) {
    return string.search(URL_REGEX) !== -1;
}
exports.shouldEmbed = shouldEmbed;
function embedResources(cssString, baseUrl, options) {
    if (!shouldEmbed(cssString)) {
        return Promise.resolve(cssString);
    }
    return Promise.resolve(cssString)
        .then(parseURLs)
        .then(function (urls) {
        return urls.reduce(function (done, url) { return done.then(function (ret) { return embed(ret, url, baseUrl, options); }); }, Promise.resolve(cssString));
    });
}
exports.embedResources = embedResources;
function parseURLs(str) {
    var result = [];
    str.replace(URL_REGEX, function (raw, quotation, url) {
        result.push(url);
        return raw;
    });
    return result.filter(function (url) { return !util_1.isDataUrl(url); });
}
exports.parseURLs = parseURLs;
function embed(cssString, resourceURL, baseURL, options, get) {
    var resolvedURL = baseURL ? resolveUrl(resourceURL, baseURL) : resourceURL;
    return Promise.resolve(resolvedURL)
        .then(function (url) { return (get ? get(url) : getBlobFromURL_1.getBlobFromURL(url, options)); })
        .then(function (data) { return util_1.toDataURL(data, util_1.getMimeType(resourceURL)); })
        .then(function (dataURL) {
        return cssString.replace(urlToRegex(resourceURL), "$1" + dataURL + "$3");
    })
        .then(function (content) { return content; }, function () { return resolvedURL; });
}
exports.embed = embed;
function resolveUrl(url, baseUrl) {
    // url is absolute already
    if (url.match(/^[a-z]+:\/\//i)) {
        return url;
    }
    // url is absolute already, without protocol
    if (url.match(/^\/\//)) {
        return window.location.protocol + url;
    }
    // dataURI, mailto:, tel:, etc.
    if (url.match(/^[a-z]+:/i)) {
        return url;
    }
    var doc = document.implementation.createHTMLDocument();
    var base = doc.createElement('base');
    var a = doc.createElement('a');
    doc.head.appendChild(base);
    doc.body.appendChild(a);
    if (baseUrl) {
        base.href = baseUrl;
    }
    a.href = url;
    return a.href;
}
function urlToRegex(url) {
    return new RegExp("(url\\(['\"]?)(" + escape(url) + ")(['\"]?\\))", 'g');
}
function escape(url) {
    return url.replace(/([.*+?^${}()|\[\]\/\\])/g, '\\$1');
}
//# sourceMappingURL=embedResources.js.map