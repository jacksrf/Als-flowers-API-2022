"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCssRules = exports.embedWebFonts = exports.parseWebFontRules = void 0;
var util_1 = require("./util");
var embedResources_1 = require("./embedResources");
function parseWebFontRules(clonedNode) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    if (!clonedNode.ownerDocument) {
                        reject(new Error('Provided element is not within a Document'));
                    }
                    resolve(util_1.toArray(clonedNode.ownerDocument.styleSheets));
                })
                    .then(getCssRules)
                    .then(getWebFontRules)];
        });
    });
}
exports.parseWebFontRules = parseWebFontRules;
function embedWebFonts(clonedNode, options) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, parseWebFontRules(clonedNode)
                    .then(function (rules) {
                    return Promise.all(rules.map(function (rule) {
                        var baseUrl = rule.parentStyleSheet
                            ? rule.parentStyleSheet.href
                            : null;
                        return embedResources_1.embedResources(rule.cssText, baseUrl, options);
                    }));
                })
                    .then(function (cssStrings) { return cssStrings.join('\n'); })
                    .then(function (cssString) {
                    var styleNode = document.createElement('style');
                    var sytleContent = document.createTextNode(cssString);
                    styleNode.appendChild(sytleContent);
                    if (clonedNode.firstChild) {
                        clonedNode.insertBefore(styleNode, clonedNode.firstChild);
                    }
                    else {
                        clonedNode.appendChild(styleNode);
                    }
                    return clonedNode;
                })];
        });
    });
}
exports.embedWebFonts = embedWebFonts;
function getCssRules(styleSheets) {
    return __awaiter(this, void 0, void 0, function () {
        var ret, promises;
        return __generator(this, function (_a) {
            ret = [];
            promises = [];
            // First loop inlines imports
            styleSheets.forEach(function (sheet) {
                if ('cssRules' in sheet) {
                    try {
                        util_1.toArray(sheet.cssRules).forEach(function (item) {
                            if (item.type === CSSRule.IMPORT_RULE) {
                                promises.push(fetchCSS(item.href, sheet)
                                    .then(embedFonts)
                                    .then(function (cssText) {
                                    var parsed = parseCSS(cssText);
                                    parsed.forEach(function (rule) {
                                        sheet.insertRule(rule, sheet.cssRules.length);
                                    });
                                })
                                    .catch(function (e) {
                                    console.log('Error loading remote css', e.toString());
                                }));
                            }
                        });
                    }
                    catch (e) {
                        var inline_1 = styleSheets.find(function (a) { return a.href === null; }) || document.styleSheets[0];
                        if (sheet.href != null) {
                            promises.push(fetchCSS(sheet.href, inline_1)
                                .then(embedFonts)
                                .then(function (cssText) {
                                var parsed = parseCSS(cssText);
                                parsed.forEach(function (rule) {
                                    inline_1.insertRule(rule, sheet.cssRules.length);
                                });
                            })
                                .catch(function (e) {
                                console.log('Error loading remote stylesheet', e.toString());
                            }));
                        }
                        console.log('Error inlining remote css file', e.toString());
                    }
                }
            });
            return [2 /*return*/, Promise.all(promises).then(function () {
                    // Second loop parses rules
                    styleSheets.forEach(function (sheet) {
                        if ('cssRules' in sheet) {
                            try {
                                util_1.toArray(sheet.cssRules).forEach(function (item) {
                                    ret.push(item);
                                });
                            }
                            catch (e) {
                                console.log("Error while reading CSS rules from " + sheet.href, e.toString());
                            }
                        }
                    });
                    return ret;
                })];
        });
    });
}
exports.getCssRules = getCssRules;
function getWebFontRules(cssRules) {
    return cssRules
        .filter(function (rule) { return rule.type === CSSRule.FONT_FACE_RULE; })
        .filter(function (rule) { return embedResources_1.shouldEmbed(rule.style.getPropertyValue('src')); });
}
function parseCSS(source) {
    if (source === undefined) {
        return [];
    }
    var cssText = source;
    var css = [];
    var cssKeyframeRegex = '((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})';
    var combinedCSSRegex = '((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]' +
        '*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})'; // to match css & media queries together
    var cssCommentsRegex = new RegExp('(\\/\\*[\\s\\S]*?\\*\\/)', 'gi');
    // strip out comments
    cssText = cssText.replace(cssCommentsRegex, '');
    var keyframesRegex = new RegExp(cssKeyframeRegex, 'gi');
    var arr;
    while (true) {
        arr = keyframesRegex.exec(cssText);
        if (arr === null) {
            break;
        }
        css.push(arr[0]);
    }
    cssText = cssText.replace(keyframesRegex, '');
    // unified regex
    var unified = new RegExp(combinedCSSRegex, 'gi');
    while (true) {
        arr = unified.exec(cssText);
        if (arr === null) {
            break;
        }
        css.push(arr[0]);
    }
    return css;
}
function fetchCSS(url, sheet) {
    return fetch(url).then(function (res) {
        return {
            url: url,
            cssText: res.text(),
        };
    }, function (e) {
        console.log('ERROR FETCHING CSS: ', e.toString());
    });
}
function embedFonts(data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, data.cssText.then(function (resolved) {
                    var cssText = resolved;
                    var regexUrlFind = /url\(["']?([^"')]+)["']?\)/g;
                    var fontLocations = cssText.match(/url\([^)]+\)/g) || [];
                    var fontLoadedPromises = fontLocations.map(function (location) {
                        var url = location.replace(regexUrlFind, '$1');
                        if (!url.startsWith('https://')) {
                            var source = data.url;
                            url = new URL(url, source).href;
                        }
                        return new Promise(function (resolve, reject) {
                            fetch(url)
                                .then(function (res) { return res.blob(); })
                                .then(function (blob) {
                                var reader = new FileReader();
                                reader.addEventListener('load', function (res) {
                                    // Side Effect
                                    cssText = cssText.replace(location, "url(" + reader.result + ")");
                                    resolve([location, reader.result]);
                                });
                                reader.readAsDataURL(blob);
                            })
                                .catch(reject);
                        });
                    });
                    return Promise.all(fontLoadedPromises).then(function () { return cssText; });
                })];
        });
    });
}
//# sourceMappingURL=embedWebFonts.js.map