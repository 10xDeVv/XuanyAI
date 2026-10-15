declare class Cube {
  static initSolver(): void;
  static fromString(facelets: string): Cube;
  static random(): Cube;
  static moveTables: Record<'flip'|'twist'|'FRtoBR'|'URFtoDLF'|'URtoUL'|'UBtoDF'|'URtoDF'|'parity'|'mergeURtoDF', number[][]>;
  static pruningTables: Record<'sliceFlip'|'sliceTwist'|'sliceURtoDFParity'|'sliceURFtoDLFParity', number[]>;
  flip(): number;
  twist(): number;
  FRtoBR(): number;
  URFtoDLF(): number;
  URtoUL(): number;
  UBtoDF(): number;
  cornerParity(): number;
  move(moves: string): Cube;
  asString(): string;
  solve(maxDepth?: number): string;
  isSolved(): boolean;
}
export = Cube;
