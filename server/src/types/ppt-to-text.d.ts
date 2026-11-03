declare module "ppt-to-text" {
  const parser: {
    readBuffer(buffer: Buffer): unknown;
    utils: {
      to_text(presentation: unknown): string[];
    };
  };

  export = parser;
}
