declare class Cube {
  static initSolver(): void;
  static fromString(facelets: string): Cube;
  static random(): Cube;
  move(moves: string): Cube;
  asString(): string;
  solve(maxDepth?: number): string;
  isSolved(): boolean;
}
export = Cube;
