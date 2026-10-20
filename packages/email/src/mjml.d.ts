declare module 'mjml' {
  interface MjmlError {
    line: number;
    message: string;
    tagName: string;
    formattedMessage: string;
  }
  interface MjmlOptions {
    validationLevel?: 'strict' | 'soft' | 'skip';
    keepComments?: boolean;
    minify?: boolean;
    beautify?: boolean;
    fonts?: Record<string, string>;
  }
  export default function mjml2html(
    input: string,
    options?: MjmlOptions,
  ): Promise<{ html: string; errors: MjmlError[] }>;
}
