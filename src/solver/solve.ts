import Cube from '../../vendor/cubejs';
import { applyMoves, quarterMoves, SOLVED, validateCube } from '../core/cube';
import { Move } from '../core/types';
import {shortSolution,shortenSolution} from './shortSolution';
let initialized=false;
export function initializeSolver() {if(!initialized){Cube.initSolver();initialized=true;}}
export function solveFacelets(facelets:string):Move[] {
  const validity=validateCube(facelets);
  if(!validity.valid)throw new Error(validity.reason);
  if(facelets===SOLVED)return [];
  let moves=shortSolution(facelets);
  if(!moves){
    initializeSolver();
    const candidate=Cube.fromString(facelets).solve().trim().split(/\s+/) as Move[];
    if(candidate.some(m=>! /^[URFDLB](2|')?$/.test(m))||applyMoves(facelets,candidate)!==SOLVED)throw new Error('The solution could not be verified.');
    moves=shortenSolution(quarterMoves(candidate));
  }
  if(moves.some(m=>! /^[URFDLB]'?$/.test(m))||applyMoves(facelets,moves)!==SOLVED)throw new Error('The solution could not be verified.');
  return moves;
}
