import { Options } from './index';
export declare function shouldEmbed(string: string): boolean;
export declare function embedResources(cssString: string, baseUrl: string | null, options: Object): Promise<string>;
export declare function parseURLs(str: string): string[];
export declare function embed(cssString: string, resourceURL: string, baseURL: string | null, options: Options, get?: (url: string) => Promise<string>): Promise<string>;
