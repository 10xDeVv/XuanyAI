import Cube from '../../vendor/cubejs';
import { applyMoves, quarterMoves, SOLVED, validateCube } from '../core/cube';
import { Move } from '../core/types';
let initialized=false;
export function initializeSolver() {if(!initialized){Cube.initSolver();initialized=true;}}
export function solveFacelets(facelets:string):Move[] {
  const validity=validateCube(facelets);
  if(!validity.valid)throw new Error(validity.reason);
  initializeSolver();
  if(facelets===SOLVED)return [];
  const moves=Cube.fromString(facelets).solve().trim().split(/\s+/) as Move[];
  if(moves.some(m=>! /^[URFDLB](2|')?$/.test(m)) || applyMoves(facelets,moves)!==SOLVED)throw new Error('The solution could not be verified.');
  return quarterMoves(moves);
}
