// Minimal typings for the parts of the Verovio toolkit we use.
// Full API: https://book.verovio.org/toolkit-reference/toolkit-methods.html
declare module 'verovio/wasm' {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    destroy(): void;
    getVersion(): string;
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page?: number, xmlDeclaration?: boolean): string;
    renderToMIDI(): string;
    redoLayout(options?: Record<string, unknown>): void;
    getLog(): string;
  }
}
