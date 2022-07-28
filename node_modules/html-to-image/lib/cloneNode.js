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
exports.cloneNode = void 0;
var clonePseudoElements_1 = require("./clonePseudoElements");
var util_1 = require("./util");
function cloneSingleNode(node) {
    return __awaiter(this, void 0, void 0, function () {
        var dataURL;
        return __generator(this, function (_a) {
            if (node instanceof HTMLCanvasElement) {
                dataURL = node.toDataURL();
                if (dataURL === 'data:,') {
                    return [2 /*return*/, Promise.resolve(node.cloneNode(false))];
                }
                return [2 /*return*/, util_1.createImage(dataURL)];
            }
            // if (node.tagName && node.tagName.toLowerCase() === 'svg') {
            //   return Promise.resolve(node as SVGElement)
            //     .then((svg) => svgToDataURL(svg))
            //     .then(createImage)
            // }
            return [2 /*return*/, Promise.resolve(node.cloneNode(false))];
        });
    });
}
function cloneChildren(nativeNode, clonedNode, filter) {
    return __awaiter(this, void 0, void 0, function () {
        var children;
        return __generator(this, function (_a) {
            children = util_1.toArray(nativeNode.childNodes);
            if (children.length === 0) {
                return [2 /*return*/, Promise.resolve(clonedNode)];
            }
            return [2 /*return*/, children
                    .reduce(function (done, child) {
                    return done
                        .then(function () { return cloneNode(child, filter); })
                        .then(function (clonedChild) {
                        if (clonedChild) {
                            clonedNode.appendChild(clonedChild);
                        }
                    });
                }, Promise.resolve())
                    .then(function () { return clonedNode; })];
        });
    });
}
function decorate(nativeNode, clonedNode) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!(clonedNode instanceof Element)) {
                return [2 /*return*/, clonedNode];
            }
            return [2 /*return*/, Promise.resolve()
                    .then(function () { return cloneCssStyle(nativeNode, clonedNode); })
                    .then(function () { return clonePseudoElements_1.clonePseudoElements(nativeNode, clonedNode); })
                    .then(function () { return cloneInputValue(nativeNode, clonedNode); })
                    .then(function () { return clonedNode; })];
        });
    });
}
function cloneCssStyle(nativeNode, clonedNode) {
    var source = window.getComputedStyle(nativeNode);
    var target = clonedNode.style;
    if (source.cssText) {
        target.cssText = source.cssText;
    }
    else {
        util_1.toArray(source).forEach(function (name) {
            target.setProperty(name, source.getPropertyValue(name), source.getPropertyPriority(name));
        });
    }
}
function cloneInputValue(nativeNode, clonedNode) {
    if (nativeNode instanceof HTMLTextAreaElement) {
        clonedNode.innerHTML = nativeNode.value;
    }
    if (nativeNode instanceof HTMLInputElement) {
        clonedNode.setAttribute('value', nativeNode.value);
    }
}
function cloneNode(nativeNode, filter, isRoot) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!isRoot && filter && !filter(nativeNode)) {
                return [2 /*return*/, Promise.resolve(null)];
            }
            return [2 /*return*/, Promise.resolve(nativeNode)
                    .then(cloneSingleNode)
                    .then(function (clonedNode) { return cloneChildren(nativeNode, clonedNode, filter); })
                    .then(function (clonedNode) { return decorate(nativeNode, clonedNode); })];
        });
    });
}
exports.cloneNode = cloneNode;
//# sourceMappingURL=cloneNode.js.map