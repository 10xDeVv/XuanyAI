export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = typeof FACES[number];
export const COLORS = ['white', 'red', 'green', 'yellow', 'orange', 'blue'] as const;
export type CubeColor = typeof COLORS[number];
export type Point = { x: number; y: number };
/** Clockwise corners, starting at the displayed grid's top left. */
export type Quad = [Point, Point, Point, Point];
export type FaceGrid<T> = [T, T, T, T, T, T, T, T, T];
export type Move = `${Face}${'' | "'" | '2'}`;
export type CenterMap = Record<Face, CubeColor>;
export type PreviewTransform = {
  frameWidth: number; frameHeight: number;
  previewWidth: number; previewHeight: number;
  rotation: 0 | 90 | 180 | 270; mirrored: boolean;
  fit?: 'cover' | 'contain';
};
export type ObservedFace = {
  colors: FaceGrid<CubeColor>;
  confidence: FaceGrid<number>;
  quad: Quad;
  sharpness: number;
  glare: number;
  /** Squares supported by regions and local boundaries, when supplied by vision. */
  cells?: number;
  /** Colors compared against six distinct center references in the same picture. */
  calibrated?: boolean;
};
export type CubeObservation = {
  timestamp: number;
  faces: ObservedFace[];
  transform: PreviewTransform;
  quality: 'good' | 'blur' | 'glare' | 'missing' | 'occluded';
  processingMs: number;
  /** Additional picture-only boundary recovery; requires whole-cube validation. */
  enhanced?: boolean;
  diagnostics?: { regions:number; grids:number };
  /** A complete 4x4 lattice was found; never interpret its 3x3 subgrids as faces. */
  largerGrid?: boolean;
};
export type CubeState = { facelets: string; centers: CenterMap; revision: number };
export type SolutionPlan = { state:CubeState; moves:Move[] };
export type FacePose = { face: Face; quad: Quad; rotations: number[] };
export type TrackingResult = {
  status: 'unchanged' | 'settling' | 'move' | 'ambiguous' | 'lost';
  poses: FacePose[];
  confidence: number;
  move?: Move;
  state?: CubeState;
  candidates: number;
};
export type SolverResult = { revision: number; moves: Move[] };
export interface SolverAdapter {
  ready(): Promise<void>;
  assemble?(input:import('./assembleScan').AssemblyInput):Promise<import('./assembleScan').ScanAssembly>;
  solve(state: CubeState): Promise<SolverResult>;
  dispose(): void;
}
export const COLOR_HEX: Record<CubeColor, string> = {
  white: '#F0EFE6', red: '#EE5B57', green: '#62CF95',
  yellow: '#F8D964', orange: '#F49A50', blue: '#609CF5',
};

